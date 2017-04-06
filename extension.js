const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const OverviewControls = imports.ui.overviewControls;
const Lang = imports.lang;
const GMenu = imports.gi.GMenu;
const Shell = imports.gi.Shell;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Favorites = imports.ui.appFavorites;
const SCHEMA = 'org.gnome.shell.extensions.activityAppLauncher';
const Gettext = imports.gettext;

Gettext.textdomain("activityAppLauncher");
Gettext.bindtextdomain("activityAppLauncher", ExtensionUtils.getCurrentExtension().path + "/locale");

const _ = Gettext.gettext;
/**
Version 1:  * First public version
Version 2:  * More elegant way for inserting the elements in the activities window
			* Now, when uninstalling the extension, removes all actors (forgot to
			  remove appsLaunchContainer)
Version 3:  * Added "Favorites apps" button
Version 4:  * Added "Frequent apps" button
			* Better memory management
Version 5:  * Ensures that no foraneous elements remain in the system
Version 6:  * Litle stupid change
Version 7:  * Allows to choose whether to show or not the "Favorites" and "Frequent" buttons
			* Added translations for the settings window
*/

const init = function() {
	return new ActivityAppLauncher();
}

const ActivityAppLauncher = new Lang.Class({
	Name: 'ActivityAppLauncher',

	_init: function() {
		this._applicationsButtons = null;
		this.appsInnerContainer = null;
		this.selected = null;
		this.currentActor = null;
		this._appSys = Shell.AppSystem.get_default();
		this._settings = this._get_schema(SCHEMA);
		this._settings.connect('changed',Lang.bind(this,this._onChangedSetting));
		this._onChangedSetting();
	},

	_onChangedSetting: function() {
		this.icon_size = this._settings.get_int("icon-size");
		this.show_virtual_desktops = this._settings.get_boolean("show-virtual-desktops");
		this.show_favorites = this._settings.get_boolean("show-favorites");
		this.show_frequent = this._settings.get_boolean("show-frequent");
		this.icon_width = Math.floor(this.icon_size * 2);
		this.icon_height = Math.floor(this.icon_size * 1.8);
	},

	_get_schema: function (schema) {
		let extension = ExtensionUtils.getCurrentExtension();

		const GioSSS = Gio.SettingsSchemaSource;

		// check if this extension was built with "make zip-file", and thus
		// has the schema files in a subfolder
		// otherwise assume that extension has been installed in the
		// same prefix as gnome-shell (and therefore schemas are available
		// in the standard folders)
		let schemaDir = extension.dir.get_child('schemas');
		let schemaSource;
		if (schemaDir.query_exists(null))
			schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
													 GioSSS.get_default(),
													 false);
		else
			schemaSource = GioSSS.get_default();

		let schemaObj = schemaSource.lookup(schema, true);
		if (!schemaObj)
			throw new Error('Schema ' + schema + ' could not be found for extension '
							+ extension.metadata.uuid + '. Please check your installation.');

		return new Gio.Settings({ settings_schema: schemaObj });
	},

	enable: function() {
		this.fill_elements(true);
		this._favorites = Favorites.getAppFavorites();
		this._usage = Shell.AppUsage.get_default();
		this.showingId = Main.overview.connect('showing', Lang.bind(this, this._show));
		this.hidingId = Main.overview.connect('hiding',Lang.bind(this,this._hide));
	},

	disable: function() {
		this.fill_elements(false);
		Main.overview.disconnect(this.showingId);
		Main.overview.disconnect(this.hidingId);
		delete (Main.overview._controls._oldUpdateSpacervisibility);
	},

	_hide: function() {
		if (this.currentActor !== null) {
			this.appsLaunchContainer.remove_actor(this.currentActor);
			this.currentActor = null;
		}
		this.appsLaunchContainer.hide();
	},

	_show: function() {
		this.visibility = "atexttoensurethateverythingworks";
		this.selected = null;
		this.setVisibility();
		this.appsLaunchContainer.hide();
		this._fillCategories();
	},

	// Modifies the Activities view to add our stage with the application categories
	fill_elements: function(desired_mode) {
		var controls = Main.overview._controls;

		if (desired_mode) {
			if (typeof(controls._oldUpdateSpacervisibility) === "undefined") {
				controls._oldUpdateSpacervisibility = controls._updateSpacerVisibility;
			}
			this.appsContainer = new St.Bin({x_expand: false, y_expand: true, y_fill:true, x_fill: true});
			this.appsLaunchContainer = new St.Bin({y_fill:true, x_fill: true});
			Main.overview._controls.viewSelector.actor.show_all();
			Main.overview._controls._thumbnailsSlider.actor.show_all();

			controls._updateSpacerVisibility = Lang.bind(this, function() {
				this.selected = null;
				if (controls._dashSpacer.visible) {
					this.appsContainer.show_all();
				} else {
					this.appsContainer.hide();
				}
				this.setVisibility();
				controls._oldUpdateSpacervisibility();
			});
		} else {
			if (typeof(controls._oldUpdateSpacervisibility) !== "undefined") {
				controls._updateSpacerVisibility = controls._oldUpdateSpacervisibility;
			}
			controls._oldUpdateSpacervisibility = null;
			controls._group.remove_actor(this.appsContainer);
			controls._group.remove_actor(this.appsLaunchContainer);
			this.appsContainer = null;
			this.appsLaunchContainer = null;
		}

		controls._group.remove_actor(controls.viewSelector.actor);
		controls._group.remove_actor(controls._thumbnailsSlider.actor);

		if (desired_mode) {
			controls._group.add(this.appsContainer, {x_fill: true, y_fill: false, expand: false});
			controls._group.add(this.appsLaunchContainer, {expand: true});
			this.appsLaunchContainer.hide();
		}
		controls._group.add(controls.viewSelector.actor, { x_fill: true, expand: true });
		controls._group.add_actor(controls._thumbnailsSlider.actor);
	},

	_fillCategories: function() {

		this.selected = null;
		if (this.appsInnerContainer !== null) {
			this.appsContainer.remove_actor(this.appsInnerContainer);
		}
		this.appsInnerContainer = new St.BoxLayout({ vertical: true });
		this.appsContainer.add_actor(this.appsInnerContainer, {x_fill: true, y_fill: false, x_expand: false, y_expand: false});

		this.appsInnerContainer.buttons = [];
		this.appsInnerContainer.appList=[];
		this.appsInnerContainer.appClass=[];

		let tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
		tree.load_sync();
		let root = tree.get_root_directory();
		let categoryMenuItem = new CathegoryMenuItem(this,1,_("Windows"), null);
		this.appsInnerContainer.add_child(categoryMenuItem);
		this.appsInnerContainer.buttons.push(categoryMenuItem);

		if (this.show_favorites) {
			let favoritesMenuItem = new CathegoryMenuItem(this,2,_("Favorites"), null);
			this.appsInnerContainer.add_actor(favoritesMenuItem);
			this.appsInnerContainer.buttons.push(favoritesMenuItem);
		}

		if (this.show_frequent) {
			let mostUsedMenuItem = new CathegoryMenuItem(this,3,_("Frequent"), null);
			this.appsInnerContainer.add_actor(mostUsedMenuItem);
			this.appsInnerContainer.buttons.push(mostUsedMenuItem);
		}

		let iter = root.iter();
		let nextType;
		while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
			if (nextType == GMenu.TreeItemType.DIRECTORY) {
				let dir = iter.get_directory();
				if (!dir.get_is_nodisplay()) {
					let childrens = this._fillCategories2(dir,[]);
				if (childrens.length != 0) {
					childrens.sort(this._sortApps);
					let item = { dirItem: dir, dirChilds: childrens };
					this.appsInnerContainer.appClass.push(item);
				}
			}
		 }
		}
		this.appsInnerContainer.appList.sort(this._sortApps);
		for (var i = 0; i < this.appsInnerContainer.appClass.length; i++) {
			let categoryMenuItem = new CathegoryMenuItem(this,0,this.appsInnerContainer.appClass[i].dirItem.get_name(), this.appsInnerContainer.appClass[i].dirChilds);
			this.appsInnerContainer.add_actor(categoryMenuItem);
			this.appsInnerContainer.buttons.push(categoryMenuItem);
		}
	},

	_sortApps: function(param1, param2) {
		if (param1.get_name().toUpperCase()<param2.get_name().toUpperCase()) {
			return -1;
		} else {
			return 1;
		}
	},

	_fillCategories2: function(dir,childrens) {
		let iter = dir.iter();
		let nextType;

		while ((nextType = iter.next()) != GMenu.TreeItemType.INVALID) {
			if (nextType == GMenu.TreeItemType.ENTRY) {
				let entry = iter.get_entry();
				if (!entry.get_app_info().get_nodisplay()) {
					let app = this._appSys.lookup_app(entry.get_desktop_file_id());
					childrens.push(app);
					this.appsInnerContainer.appList.push(app);
				}
			} else if (nextType == GMenu.TreeItemType.DIRECTORY) {
				childrens = this._fillCategories2(iter.get_directory(), childrens);
			}
		}
		return childrens;
	},

	clickedCathegory: function(button) {
		for(var i = 0; i < this.appsInnerContainer.buttons.length; i++) {
			var tmpbutton = this.appsInnerContainer.buttons[i];
			if (button == tmpbutton) {
				tmpbutton.checked = true;
			} else {
				tmpbutton.checked = false;
			}
		}
		if (button.launcherType == 1) {
			this.selected = null; // for Windows list, the selected button must be null
		} else {
			this.selected = button.cat;
		}
		this.setVisibility();
		if (this.currentActor !== null) {
			this.appsLaunchContainer.remove_actor(this.currentActor);
			this.currentActor = null;
		}
		if (this.selected !== null) {
			this.currentActor = new St.ScrollView({hscrollbar_policy: Gtk.PolicyType.NEVER, x_fill: true, y_fill: true});
			this.appsLaunchContainer.add_actor(this.currentActor, {x_expand: true, y_expand: true});
			this.currentActor.iconsContainer = new St.BoxLayout({ vertical: true, x_expand: true});
			this.last_iconx = 0;
			this.currentActor.iconsContainer.connect_after("allocation-changed", Lang.bind(this, function(actor, event) {
				let [sizex, sizey] = this.currentActor.iconsContainer.get_size();

				if (this.last_iconx >= sizex) {
					return;
				}
				this.last_iconx = sizex;
				var iconx = Math.floor(sizex / this.icon_width);
				this.currentActor.iconsContainer.remove_all_children();
				var position = 0;
				var currentContainer = null;
				var launcherList = null;
				switch (button.launcherType) {
					case 0:
						launcherList = button.launchers;
						break;
					case 2:
						launcherList = this._favorites.getFavorites();
						break;
					case 3:
						launcherList = this._usage.get_most_used("");
						break;
					default:
						launcherList = null;
						break;
				}
				if (launcherList !== null) {
					for(let i = 0;i < launcherList.length; i++) {
						var element = launcherList[i];
						if (position == 0) {
							currentContainer = new St.BoxLayout({vertical: false, x_expand: true});
							this.currentActor.iconsContainer.add_child(currentContainer,{expand: true});
						}
						var tmpContainer = new St.BoxLayout({vertical: true, reactive: true, style_class:'activityAppLauncher_element', width: this.icon_width, height: this.icon_height});
						tmpContainer.icon = element.create_icon_texture(this.icon_size);
						tmpContainer.text = new St.Label({text: element.get_name(), style_class: 'list-search-result-title activityAppLauncher_text'});
						tmpContainer.text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD;
						tmpContainer.text.clutter_text.line_wrap = true;
						tmpContainer.add_child(tmpContainer.icon, {x_fill: false, y_fill: false,x_align: St.Align.MIDDLE, y_align: St.Align.START});
						tmpContainer.add_child(tmpContainer.text, {x_fill: true, y_fill: true,x_align: St.Align.MIDDLE, y_align: St.Align.START});
						currentContainer.add_child(tmpContainer);

						tmpContainer._app = element;
						tmpContainer._customEventId = tmpContainer.connect('button-release-event', Lang.bind(this,
							function(actor, event) {
								actor._app.open_new_window(-1);
								Main.overview.hide();
							})
						);
						tmpContainer._customEnterId = tmpContainer.connect('enter-event', Lang.bind(this,
							function (actor, event) {
								actor.set_style_pseudo_class("selected");
							}));

						tmpContainer._customLeaveId = tmpContainer.connect('leave-event', Lang.bind(this,
							function (actor, event) {
								actor.set_style_pseudo_class("");
							}));
						position++;
						if (position == iconx) {
							position = 0;
						}
					}
				}
				this.appsLaunchContainer.show_all();
			}));
			this.currentActor.add_actor(this.currentActor.iconsContainer, {x_fill: true, y_fill: true});
			this.appsLaunchContainer.show_all();
		}
	},

	setVisibility: function() {
		if (this.visibility != this.selected) {
			this.visibility = this.selected;
			var workspacesDisplay = Main.overview._controls.viewSelector._workspacesDisplay;
			if (this.selected === null) {
				this.appsLaunchContainer.hide();
				if (!this.show_virtual_desktops) {
					Main.overview._controls._thumbnailsSlider.actor.show_all();
				}
				for (let i = 0; i < workspacesDisplay._workspacesViews.length; i++)
				workspacesDisplay._workspacesViews[i].actor.show();
				workspacesDisplay.actor.show();
				Main.overview._controls.viewSelector.actor.show();
			} else {
				this.appsLaunchContainer.show_all();
				if (!this.show_virtual_desktops) {
					Main.overview._controls._thumbnailsSlider.actor.hide();
				}
				for (let i = 0; i < workspacesDisplay._workspacesViews.length; i++)
				workspacesDisplay._workspacesViews[i].actor.hide();
				workspacesDisplay.actor.hide();
				Main.overview._controls.viewSelector.actor.hide();
			}
		}
	}
});

const CathegoryMenuItem = new Lang.Class({
	Name: "CathegoryMenuItem",
	Extends: St.Button,

	_init: function(topClass, type, cathegory, launchers) {
		this.topClass = topClass;
		this.cat = cathegory;
		this.launchers = launchers;
		this.launcherType = type;
		this.parent({label: cathegory, style_class: "world-clocks-button button", toggle_mode: true, can_focus: true, track_hover: true});
		this.connect("clicked",Lang.bind(this,function() {
			this.topClass.clickedCathegory(this);
		}));
		this.show_all();
	}
});
