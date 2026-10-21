/**
 * The module-graph control: it imports the driver and does nothing else. A driver
 * import opens no socket, which is why the connection detector needs a control of
 * its own.
 */
import "pg";
