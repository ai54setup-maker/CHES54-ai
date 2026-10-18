#!/usr/bin/env python3
"""Server locale di CHES54.ai: serve i file dell'app sul computer e sulla rete Wi-Fi."""
import errno
import http.server
import os
import socket
import socketserver
import sys
import webbrowser

args = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(args[0]) if args else 5454
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".webmanifest": "application/manifest+json",
        ".js": "text/javascript",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


try:
    httpd = Server(("0.0.0.0", PORT), Handler)
except OSError as e:
    if e.errno not in (errno.EADDRINUSE, 10048):
        raise
    # La porta è occupata: di solito è CHES54.ai già avviato in un'altra finestra.
    print(f"\n  ♟  La porta {PORT} è già in uso: CHES54.ai è probabilmente già aperto.")
    print(f"  Apro http://localhost:{PORT} nel browser.")
    print(f"  Se la pagina non si carica, chiudi l'altro programma o usa un'altra porta:")
    print(f"      python3 server.py {PORT + 1}\n", flush=True)
    if "--no-browser" not in sys.argv:
        webbrowser.open(f"http://localhost:{PORT}")
    sys.exit(0)

with httpd:
    ip = lan_ip()
    print("\n  ♟  CHES54.ai è in esecuzione!\n")
    print(f"  Sul computer:   http://localhost:{PORT}")
    if ip:
        print(f"  Sul telefono:   http://{ip}:{PORT}   (stessa rete Wi-Fi)")
    print("\n  Per chiudere: premi Ctrl+C oppure chiudi questa finestra.\n", flush=True)
    if "--no-browser" not in sys.argv:
        webbrowser.open(f"http://localhost:{PORT}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
