/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */

const Gtk = imports.gi.Gtk;
const GLib = imports.gi.GLib;

const ExtensionUtils = imports.misc.extensionUtils;
const Gio = imports.gi.Gio;
const Gettext = imports.gettext;

Gettext.textdomain("activityAppLauncher");
Gettext.bindtextdomain("activityAppLauncher", ExtensionUtils.getCurrentExtension().path + "/locale");

var _=Gettext.gettext

const SCHEMA = 'org.gnome.shell.extensions.activityAppLauncher';

let settings;

function init() {
    settings = get_schema(SCHEMA);
}

function get_schema(schema) {
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
}

function buildPrefsWidget() {
    let frame = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, border_width: 10, spacing: 10});

    let desktops_switch = buildSwitcher('show-virtual-desktops', _("Show the virtual desktops when a category has been chosen."));
    frame.add(desktops_switch);

    let icon_size = buildSpinButton('icon-size',_("Size for the icons."));
    frame.add(icon_size);
	
	let show_favorites = buildSwitcher('show-favorites',_("Show 'Favorite apps' in the category menu."));
    frame.add(show_favorites);
	
	let show_frequent = buildSwitcher('show-frequent',_("Show 'Frequent apps' in the category menu."));
    frame.add(show_frequent);

    frame.show_all();

    return frame;
}

function buildSwitcher(key, labeltext) {
    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });

    let label = new Gtk.Label({label: labeltext, xalign: 0 });

    let switcher = new Gtk.Switch({active: settings.get_boolean(key)});

    settings.bind(key,switcher,'active',3);

    hbox.pack_start(label, true, true, 0);
    hbox.add(switcher);

    return hbox;
}

function buildSpinButton(key, labeltext) {
    let hbox = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });

    let label = new Gtk.Label({label: labeltext, xalign: 0 });
    let adjust = new Gtk.Adjustment({lower: 16, upper: 128, value: settings.get_int(key), step_increment: 16});
    let spin = new Gtk.SpinButton({digits: 0, adjustment: adjust});


    settings.bind(key,adjust,'value',3);

    hbox.pack_start(label, true, true, 0);
    hbox.add(spin);

    return hbox;
}
