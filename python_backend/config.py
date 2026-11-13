"""Private, server-only configuration shared by Passenger and the collector."""
import json
import os
import stat
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEYS = frozenset({
    'GML_MODE', 'GML_ACCESS', 'GML_DB', 'GML_ACCESS_USER', 'GML_ACCESS_HASH',
    'GML_TRUST_HTTPS_PROXY', 'MQTT_HOST', 'MQTT_PORT', 'MQTT_USERNAME',
    'MQTT_PASSWORD', 'MQTT_TLS', 'MQTT_ALLOW_INSECURE',
})


def config_path():
    if os.environ.get('GML_ENV'):
        return Path(os.environ['GML_ENV']).expanduser().resolve()
    if os.environ.get('GML_MODE') == 'local':
        return ROOT / 'server' / '.env'
    return ROOT.parent / 'gml-private' / 'gml.env'


def load_config():
    values = {}
    path = config_path()
    if path.is_file():
        if os.name != 'nt' and path.stat().st_mode & (stat.S_IRWXG | stat.S_IRWXO):
            raise ValueError('Private configuration permissions must be 0600')
        for line in path.read_text(encoding='utf-8').splitlines():
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            key, separator, value = line.partition('=')
            key, value = key.strip(), value.strip()
            if separator and key in KEYS:
                if value.startswith('"'):
                    value = json.loads(value)
                elif value.startswith("'") and value.endswith("'"):
                    value = value[1:-1]
                if not isinstance(value, str):
                    raise ValueError('Invalid configuration value')
                values[key] = value
    values.update({k: os.environ[k] for k in KEYS if k in os.environ})
    return values


def database_path():
    env = load_config()
    return Path(env.get('GML_DB', ROOT / 'server' / 'data' / 'gml.sqlite')).expanduser().resolve()
