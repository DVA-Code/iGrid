"""Read-only deployment configuration checks; optional TCP/TLS probe sends no credentials."""
import argparse
import importlib.metadata
import os
import socket
import sqlite3
import ssl
import sys
from pathlib import Path
from python_backend.config import ROOT,config_path,database_path,load_config
from python_backend.security import hash_valid


def checks(network=False):
    results=[]
    def check(label,ok):results.append((label,bool(ok)))
    check('Python 3.9 or later',sys.version_info>=(3,9))
    check('Application outside public web directory',not any(x.lower() in ('public_html','www') for x in ROOT.parts))
    check('Production frontend exists',(ROOT/'dist/index.html').is_file())
    check('Server-only meter registry exists',(ROOT/'server/meters.json').is_file())
    check('Private configuration exists',config_path().is_file())
    try:env=load_config()
    except (ValueError,OSError):
        check('Private configuration readable with safe permissions',False)
        return results
    check('Production mode',env.get('GML_MODE','production')!='local')
    check('Explicit valid access policy',env.get('GML_ACCESS','private')=='public' or (env.get('GML_ACCESS','private')=='private' and bool(env.get('GML_ACCESS_USER')) and hash_valid(env.get('GML_ACCESS_HASH'))))
    check('Private storage outside app and public web directory',not database_path().is_relative_to(ROOT) and not any(x.lower() in ('public_html','www') for x in database_path().parts))
    check('Storage directory writable',database_path().parent.is_dir() and os.access(database_path().parent,os.W_OK))
    check('Dedicated MQTT credentials configured',bool(env.get('MQTT_USERNAME') and env.get('MQTT_PASSWORD')))
    check('TLS enabled or plaintext risk explicitly accepted',env.get('MQTT_TLS')=='true' or env.get('MQTT_ALLOW_INSECURE')=='true')
    try:version=importlib.metadata.version('paho-mqtt');check('Paho MQTT 2.x installed',version.split('.')[0]=='2')
    except importlib.metadata.PackageNotFoundError:check('Paho MQTT 2.x installed',False)
    try:
        with sqlite3.connect(':memory:') as connection:check('SQLite JSON support',connection.execute("SELECT json_extract('{\"a\":1}','$.a')").fetchone()[0]==1)
    except sqlite3.Error:check('SQLite JSON support',False)
    if network:
        try:
            with socket.create_connection((env.get('MQTT_HOST','mqtt.iammeter.com'),int(env.get('MQTT_PORT','1883'))),timeout=8) as sock:
                if env.get('MQTT_TLS')=='true':
                    with ssl.create_default_context().wrap_socket(sock,server_hostname=env['MQTT_HOST']):pass
            check('Broker TCP/TLS reachable (authentication and readings not tested)',True)
        except (OSError,ValueError):check('Broker TCP/TLS reachable (authentication and readings not tested)',False)
    return results


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--network',action='store_true');args=parser.parse_args()
    results=checks(args.network)
    for label,ok in results:print(('PASS ' if ok else 'FAIL ')+label)
    print('Host must separately permit a persistent collector and provide HTTPS; this script cannot verify hosting policy.')
    raise SystemExit(0 if all(ok for _,ok in results) else 1)


if __name__=='__main__':main()
