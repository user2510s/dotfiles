import Gio from "gi://Gio";
import GioUnix from 'gi://GioUnix';
import GLib from "gi://GLib";
export function get_pactl_path(settings) {
    let pactl_path = GLib.find_program_in_path(settings.get_string("pactl-path"));
    let using_custom_path = true;
    if (pactl_path == null) {
        pactl_path = GLib.find_program_in_path('pactl');
        using_custom_path = false;
    }
    return [pactl_path, using_custom_path];
}
export function spawn(argv) {
    return new Promise((resolve, _reject) => {
        const [, , , stdout,] = GLib.spawn_async_with_pipes(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null);
        const stdout_reader = new Gio.DataInputStream({
            base_stream: new GioUnix.InputStream({ fd: stdout })
        });
        const result_string = [];
        const readline_callback = (_, result) => {
            const [stdout, length] = stdout_reader.read_upto_finish(result);
            if (length > 0) {
                result_string.push(stdout);
                stdout_reader.read_upto_async("", 0, 0, null, readline_callback);
            }
            else {
                resolve(result_string.join("\n"));
            }
        };
        stdout_reader.read_upto_async("", 0, 0, null, readline_callback);
    });
}
const idle_ids = [];
export function wait_property(object, name) {
    return new Promise((resolve, _reject) => {
        // very ugly hack
        const id_pointer = {};
        const id = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, wait_property_loop.bind(null, resolve, id_pointer));
        id_pointer.id = id;
        idle_ids.push(id);
    });
    function wait_property_loop(resolve, pointer) {
        if (object[name] !== undefined) {
            const index = idle_ids.indexOf(pointer.id);
            if (index !== -1) {
                idle_ids.splice(index, 1);
            }
            resolve(object[name]);
            return GLib.SOURCE_REMOVE;
        }
        return GLib.SOURCE_CONTINUE;
    }
}
export function cleanup_idle_ids() {
    for (const id of idle_ids) {
        GLib.Source.remove(id);
        console.warn(`[QSAP] Needed to clear an idle loop, this is likely a bug (id: ${id})`);
    }
    idle_ids.length = 0;
}
