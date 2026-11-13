// Only expose known error classifications; raw errors may contain connection details.
export function mqttReason(error){
 const code=String(error?.code??error?.reasonCode??'')
 const known={
  '4':'MQTT broker rejected the username or password',
  '5':'MQTT broker denied access for this account',
  '134':'MQTT broker rejected the username or password',
  '135':'MQTT broker denied access for this account',
  ENOTFOUND:'MQTT broker hostname could not be resolved by DNS',
  EAI_AGAIN:'MQTT broker DNS lookup temporarily failed',
  ECONNREFUSED:'MQTT broker TCP connection was refused',
  ETIMEDOUT:'MQTT broker connection timed out',
  ESOCKETTIMEDOUT:'MQTT broker connection timed out',
  ECONNRESET:'MQTT broker connection was reset',
  ENETUNREACH:'The network route to the MQTT broker is unavailable',
  EHOSTUNREACH:'The MQTT broker host is unreachable from this server',
  EACCES:'The operating system denied the MQTT network connection',
  EPERM:'The operating system denied the MQTT network connection',
  ERR_TLS_CERT_ALTNAME_INVALID:'MQTT TLS certificate does not match the broker hostname',
  CERT_HAS_EXPIRED:'MQTT TLS certificate has expired',
  DEPTH_ZERO_SELF_SIGNED_CERT:'MQTT TLS certificate is not trusted',
 }
 if(known[code])return known[code]
 if(/connack timeout/i.test(error?.message??''))return 'MQTT broker did not acknowledge the connection before timeout'
 return 'MQTT connection failed; the client did not identify the cause'
}
