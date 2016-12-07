const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const OverviewControls = imports.ui.overviewControls;
const Lang = imports.lang;
const GMenu = imports.gi.GMenu;
const Shell = imports.gi.Shell;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;

const ICON_WIDTH = 128;
const ICON_HEIGHT = 128;
const ICON_SIZE = 64;

const init = function() {
	return new ActivityAppLauncher();
}

const ActivityAppLauncher = new Lang.Class({
    Name: 'ActivityAppLauncher',

    _init: function() {
		 this._applicationsButtons = null;
		 this.appsInnerContainer = null;
		 this.selected = null;
		 this.current_actor = null;
		 this._appSys = Shell.AppSystem.get_default();
	},
	
	enable: function() {
		this.fill_elements(true);
		this.showingId = Main.overview.connect('showing', Lang.bind(this, this._show));
		this.hidingId = Main.overview.connect('hiding',Lang.bind(this,this._hide));
	},

	disable: function() {
		this.fill_elements(false);
		Main.overview.disconnect(this.showingId);
		Main.overview.disconnect(this.hidingId);
	},

	_hide: function() {
		if (this.current_actor !== null) {
			this.appsLaunchContainer.remove_actor(this.current_actor);
			this.current_actor = null;
		}
		this.appsLaunchContainer.hide();
	},
	
	_show: function() {
		this.visibility = "atexttoensurethateverythingworks";
		this.appsLaunchContainer.hide();
		this._fillCategories();
	},

	// Modifies the Activities view to add our stage with the application categories
	fill_elements: function(desired_mode) {
		var old_group = Main.overview._controls._group;
		var controls = Main.overview._controls;

		if (desired_mode) {
			controls._oldUpdateSpacervisibility = controls._updateSpacerVisibility;
			this.appsContainer = new St.Bin({x_expand: false, y_expand: true, y_fill:true, x_fill: true});
			this.appsLaunchContainer = new St.Bin({x_expand: true, y_expand: true, y_fill:true, x_fill: true});
			this.appsLaunchContainer.hide();
			Main.overview._controls.viewSelector.actor.show_all();
			Main.overview._controls._thumbnailsSlider.actor.show_all();

			controls._updateSpacerVisibility = Lang.bind(this, function() {
				controls._oldUpdateSpacervisibility();
				if (controls._dashSpacer.visible) {
					this.appsContainer.show_all();
				} else {
					this.appsContainer.hide();
				}
				this.setVisibility();
			});
		} else {
			controls._updateSpacerVisibility = controls._oldUpdateSpacervisibility;
			old_group.remove_actor(appsContainer);
		}

		controls._group = new St.BoxLayout({ name: 'overview-group', x_expand: true, y_expand: true });
		controls.actor.remove_actor(old_group);
		controls.actor.remove_actor(controls._dashSlider.actor);
		controls.actor.add_actor(controls._group);
		controls.actor.add_actor(controls._dashSlider.actor);
		old_group.remove_actor(controls._dashSpacer);
		old_group.remove_actor(controls.viewSelector.actor);
		old_group.remove_actor(controls._thumbnailsSlider.actor);

		controls._group.add_actor(controls._dashSpacer);
		if (desired_mode) {
			controls._group.add(this.appsContainer);
			controls._group.add(this.appsLaunchContainer);
		}
		controls._group.add(controls.viewSelector.actor, { x_fill: true, expand: true });
		controls._group.add_actor(controls._thumbnailsSlider.actor);
	},

	_fillCategories: function() {

		this.selected = null;
		if (this.appsInnerContainer !== null) {
			this.appsContainer.remove_actor(this.appsInnerContainer);
			this.appsContainer.disconnect(this.appsContainer.customDestroyId);
		}
		this.appsInnerContainer = new St.BoxLayout({ vertical: true });
		this.appsContainer.add_actor(this.appsInnerContainer);
		this.appsContainer.customDestroyId = this.appsContainer.connect("destroy", Lang.bind(this, function(actor, event) {
			actor.remove_actor(this.appsInnerContainer);
		}));

		this.buttons = [];
      this._appList=[];
      this._appClass=[];

      let tree = new GMenu.Tree({ menu_basename: 'applications.menu' });
      tree.load_sync();
      let root = tree.get_root_directory();

		let categoryMenuItem = new CathegoryMenuItem(this,null, null);
      this.appsInnerContainer.add_child(categoryMenuItem);
		this.appsInnerContainer.customDestroyId = this.appsInnerContainer.connect("destroy", Lang.bind(this, function(actor, event) {
			actor.remove_actor(categoryMenuItem);
		}));
		this.buttons.push(categoryMenuItem);

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
	            	this._appClass.push(item);
					}
            }
         }
      }
   	this._appList.sort(this._sortApps);
		for (var i = 0; i < this._appClass.length; i++) {
			let categoryMenuItem = new CathegoryMenuItem(this,this._appClass[i].dirItem.get_name(), this._appClass[i].dirChilds);
			this.appsInnerContainer.add_actor(categoryMenuItem);
			this.appsInnerContainer.customDestroyId = this.appsInnerContainer.connect("destroy", Lang.bind(this, function(actor, event) {
				actor.remove_actor(categoryMenuItem);
			}));
			this.buttons.push(categoryMenuItem);
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
                    this._appList.push(app);
                }
            } else if (nextType == GMenu.TreeItemType.DIRECTORY) {
                childrens = this._fillCategories2(iter.get_directory(), childrens);
            }
        }
		  return childrens;
    },

	clickedCathegory: function(button) {
		for(var i = 0; i < this.buttons.length; i++) {
			var tmpbutton = this.buttons[i];
			if (button == tmpbutton) {
				tmpbutton.checked = true;
			} else {
				tmpbutton.checked = false;
			}
		}
		this.selected = button.cat;
		this.setVisibility();
		if (this.current_actor !== null) {
			this.appsLaunchContainer.remove_actor(this.current_actor);
			this.appsLaunchContainer.disconnect(this.appsLaunchContainer.customDestroyId);
			this.current_actor = null;
		}
		if (this.selected !== null) {
			this.current_actor = new St.ScrollView({hscrollbar_policy: Gtk.PolicyType.NEVER});
			this.appsLaunchContainer.add_actor(this.current_actor, {expand: true, fill: true});
			this.appsLaunchContainer.customDestroyId = this.appsLaunchContainer.connect("destroy", Lang.bind(this, function(actor, event) {
				actor.remove_actor(this.current_actor);
			}));
			
			this.iconsContainer = new St.BoxLayout({ vertical: true});
			this.current_actor.add_actor(this.iconsContainer, {expand: true, fill: true});
			this.current_actor.customDestroyId = this.current_actor.connect("destroy", Lang.bind(this, function(actor, event) {
				actor.remove_actor(this.iconsContainer);
			}));

			let [sizex, sizey] = this.appsLaunchContainer.get_size();
			var iconx = 8;
			var position = 0;
			var currentContainer = null;
			for(let i = 0;i < button.launchers.length; i++) {
				var element = button.launchers[i];
				if (position == 0) {
					currentContainer = new St.BoxLayout({vertical: false});
					this.iconsContainer.add_child(currentContainer);
				}
				var tmpContainer = new St.BoxLayout({vertical: true, reactive: true, style_class:'popup-menu-item', width: ICON_WIDTH, height: ICON_HEIGHT});
				tmpContainer.icon = element.create_icon_texture(ICON_SIZE);
				tmpContainer.text = new St.Label({text: element.get_name(), style_class: 'activityAppLauncher_text'});
				tmpContainer.text.clutter_text.line_wrap_mode = Pango.WrapMode.WORD;
				tmpContainer.text.clutter_text.line_wrap = true;
				tmpContainer.add_child(tmpContainer.icon, {x_fill: false, y_fill: false,x_align: St.Align.MIDDLE, y_align: St.Align.START});
				tmpContainer.add_child(tmpContainer.text, {x_fill: true, y_fill: true,x_align: St.Align.MIDDLE, y_align: St.Align.START});
				currentContainer.add_child(tmpContainer);
				
				tmpContainer._app = element;
				tmpContainer._customEventId = tmpContainer.connect('button-release-event', Lang.bind(this,
					function(actor, event) {
						actor._app.open_new_window(-1);
					})
				);
				tmpContainer._customEnterId = tmpContainer.connect('enter-event', Lang.bind(this,
					function (actor, event) {
						
					}));
				tmpContainer._customLeaveId = tmpContainer.connect('leave-event', Lang.bind(this,
					function (actor, event) {
						
					}));
				position++;
				if (position == iconx) {
					position = 0;
				}
			}
			this.appsLaunchContainer.show_all();
		}
	},

	setVisibility: function() {
		if (this.visibility != this.selected) {
			this.visibility = this.selected;
			var workspacesDisplay = Main.overview._controls.viewSelector._workspacesDisplay;
			if (this.selected === null) {
				this.appsLaunchContainer.hide();
				Main.overview._controls._thumbnailsSlider.actor.show_all();
				for (let i = 0; i < workspacesDisplay._workspacesViews.length; i++)
            	workspacesDisplay._workspacesViews[i].actor.show();
				workspacesDisplay.actor.show();
			} else {
				this.appsLaunchContainer.show_all();
				Main.overview._controls._thumbnailsSlider.actor.hide();
				for (let i = 0; i < workspacesDisplay._workspacesViews.length; i++)
            	workspacesDisplay._workspacesViews[i].actor.hide();
				workspacesDisplay.actor.hide();
			}
		}
	}
});

const CathegoryMenuItem = new Lang.Class({
	Name: "CathegoryMenuItem",
	Extends: St.Button,
	
	_init: function(topClass, cathegory, launchers) {
		this.topClass = topClass;
		this.cat = cathegory;
		this.launchers = launchers;
		if (cathegory === null) {
			cathegory = "Windows";
		}
		this.parent({label: cathegory, style_class: "world-clocks-button button", toggle_mode: true, can_focus: true, track_hover: true});
		this.connect("clicked",Lang.bind(this,function() {
			this.topClass.clickedCathegory(this);
		}));
		this.show_all();
		
	}
});
