"""Small, fail-closed access boundary; production HTTPS is mandatory."""
import base64
import binascii
import hashlib
import hmac
import ipaddress
import secrets
import threading
import time
from collections import OrderedDict

ITERATIONS = 600000
_verified = OrderedDict()
_failures = OrderedDict()
_lock = threading.Lock()


def password_hash(password):
    if not 12 <= len(password) <= 1024:
        raise ValueError('Use an access password of 12 to 1024 characters')
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ITERATIONS)
    return f'pbkdf2_sha256${ITERATIONS}${salt}${digest.hex()}'


def hash_valid(encoded):
    try:
        algorithm, rounds, salt, digest = encoded.split('$')
        return (algorithm == 'pbkdf2_sha256' and 600000 <= int(rounds) <= 2000000
                and len(bytes.fromhex(salt)) == 16 and len(bytes.fromhex(digest)) == 32)
    except (ValueError, TypeError, AttributeError):
        return False


def verify(password, encoded):
    if not hash_valid(encoded) or len(password) > 1024:
        return False
    _, rounds, salt, expected = encoded.split('$')
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds))
    return hmac.compare_digest(actual, bytes.fromhex(expected))


def is_https(environ, env):
    if environ.get('wsgi.url_scheme') == 'https' or environ.get('HTTPS', '').lower() in ('on', '1'):
        return True
    # Enable ONLY when the hosting provider strips incoming forwarded headers.
    return env.get('GML_TRUST_HTTPS_PROXY') == 'true' and environ.get('HTTP_X_FORWARDED_PROTO') == 'https'


def authorize(environ, env):
    """Return (HTTP status, generic message, extra headers), or None on success."""
    local = env.get('GML_MODE') == 'local'
    if local:
        try:
            if ipaddress.ip_address(environ.get('REMOTE_ADDR', '')).is_loopback:
                return None
        except ValueError:
            pass
        return ('403 Forbidden', 'Local development is available only on this computer', [])
    if not is_https(environ, env):
        return ('403 Forbidden', 'HTTPS is required', [])
    access = env.get('GML_ACCESS', 'private')
    if access == 'public':
        return None
    user, encoded = env.get('GML_ACCESS_USER', ''), env.get('GML_ACCESS_HASH', '')
    if access != 'private' or not user or not hash_valid(encoded):
        return ('503 Service Unavailable', 'Dashboard access is not configured', [])
    address = environ.get('REMOTE_ADDR', 'unknown')
    instant = time.monotonic()
    with _lock:
        failures = [t for t in _failures.get(address, []) if instant - t < 60]
        if len(failures) >= 10:
            return ('429 Too Many Requests', 'Too many sign-in attempts; retry shortly', [('Retry-After', '60')])
    header = environ.get('HTTP_AUTHORIZATION', '')
    success = False
    if header.startswith('Basic ') and len(header) <= 8192:
        try:
            supplied_user, password = base64.b64decode(header[6:], validate=True).decode('utf-8').split(':', 1)
            # Cache a one-way digest, never the Basic header or clear password.
            key = hashlib.sha256((header + '\0' + user + '\0' + encoded).encode()).digest()
            with _lock:
                cached = _verified.get(key, 0) > instant
            success = hmac.compare_digest(supplied_user.encode(), user.encode()) and (cached or verify(password, encoded))
            if success:
                with _lock:
                    _verified[key] = instant + 300
                    while len(_verified) > 256:
                        _verified.popitem(last=False)
        except (ValueError, UnicodeError, binascii.Error):
            pass
    if success:
        return None
    if header:
        with _lock:
            _failures[address] = failures + [instant]
            _failures.move_to_end(address)
            while len(_failures) > 1024:
                _failures.popitem(last=False)
    return ('401 Unauthorized', 'Sign-in required', [('WWW-Authenticate', 'Basic realm="GML research", charset="UTF-8"')])


def headers(secure=False):
    result = [
        ('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'no-referrer'),
        ('X-Frame-Options', 'SAMEORIGIN'),
        ('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'),
        ('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://server.arcgisonline.com https://gmlab.ku.edu.np; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'"),
    ]
    if secure:
        result.append(('Strict-Transport-Security', 'max-age=31536000'))
    return result
