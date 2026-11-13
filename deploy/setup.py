"""Run on the hosting account: python -m deploy.setup (never from public_html)."""
import argparse
import getpass
import json
import os
from pathlib import Path
from python_backend.config import ROOT
from python_backend.security import password_hash


def main():
    parser=argparse.ArgumentParser(description='Create new private GML production configuration')
    parser.add_argument('--private-dir',type=Path,default=ROOT.parent/'gml-private')
    parser.add_argument('--public',action='store_true',help='Explicitly allow anyone to view readings and history')
    args=parser.parse_args()
    directory=args.private_dir.expanduser().resolve()
    if any(p.lower() in ('public_html','www','dist') for p in directory.parts) or directory.is_relative_to(ROOT):
        raise SystemExit('Private storage must be outside the application and web document root.')
    if any(p.lower() in ('public_html','www') for p in ROOT.parts):
        raise SystemExit('Move the application outside public_html before setup.')
    directory.mkdir(mode=0o700,parents=True,exist_ok=True)
    if os.name!='nt':directory.chmod(0o700)
    target=directory/'gml.env'
    if target.exists():raise SystemExit('Private configuration already exists; no settings or history were changed. Edit it privately to rotate credentials.')
    host=input('MQTT broker host [mqtt.iammeter.com]: ').strip() or 'mqtt.iammeter.com'
    use_tls=input('Use verified TLS on a broker already configured for your meters? [y/N]: ').strip().lower()=='y'
    port=int(input(f'MQTT port [{8883 if use_tls else 1883}]: ').strip() or (8883 if use_tls else 1883))
    if not 1<=port<=65535 or any(c in host for c in '/@\r\n '):raise SystemExit('Invalid broker host or port.')
    if not use_tls:
        print('This connection sends MQTT credentials and readings without encryption. IAMMETER port 1883 does not provide TLS.')
        if input('Type ACCEPT PLAINTEXT to explicitly use this connection: ').strip()!='ACCEPT PLAINTEXT':
            raise SystemExit('Setup stopped; configure a verified TLS broker before retrying.')
    username=input('Dedicated MQTT username: ').strip()
    mqtt_password=getpass.getpass('Dedicated MQTT password (hidden): ')
    if not username or not mqtt_password:raise SystemExit('MQTT credentials are required.')
    values={'GML_MODE':'production','GML_ACCESS':'public' if args.public else 'private',
            'GML_DB':str(directory/'gml.sqlite'),'MQTT_HOST':host,'MQTT_PORT':str(port),
            'MQTT_USERNAME':username,'MQTT_PASSWORD':mqtt_password,'MQTT_TLS':str(use_tls).lower(),
            'MQTT_ALLOW_INSECURE':str(not use_tls).lower(),'GML_TRUST_HTTPS_PROXY':'false'}
    if not args.public:
        user=input('Dashboard sign-in username [gml]: ').strip() or 'gml'
        if ':' in user or len(user)>80:raise SystemExit('Invalid dashboard username.')
        password=getpass.getpass('NEW dashboard password (12+ characters; hidden): ')
        if password!=getpass.getpass('Repeat dashboard password: '):raise SystemExit('Passwords did not match.')
        values.update(GML_ACCESS_USER=user,GML_ACCESS_HASH=password_hash(password))
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w',encoding='utf-8') as stream:
        stream.write('# Server-only. Never upload under public_html or share this file.\n')
        for key,value in values.items():stream.write(key+'='+json.dumps(value)+'\n')
    print('Private configuration created. Existing database files were preserved.')
    print('Set this single environment variable for Passenger and collector:')
    print('GML_ENV='+str(target))


if __name__=='__main__':
    try:main()
    except (ValueError,OSError):raise SystemExit('Setup failed. Check input and private directory permissions; no secrets were printed.') from None
