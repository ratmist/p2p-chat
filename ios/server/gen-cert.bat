@echo off
REM Положи этот файл в корень проекта (рядом с папкой server/)
REM Запусти двойным кликом — пересоздаст сертификат как рабочий

set CERT_DIR=server\.certs
if not exist %CERT_DIR% mkdir %CERT_DIR%

REM === ТВОЙ ТЕКУЩИЙ IP ===
set MY_IP=192.168.1.35

echo Generating cert for %MY_IP% ...

(
echo [req]
echo default_bits       = 2048
echo prompt             = no
echo default_md         = sha256
echo distinguished_name = dn
echo x509_extensions    = v3_req
echo.
echo [dn]
echo CN = %MY_IP%
echo.
echo [v3_req]
echo subjectAltName = IP:%MY_IP%,IP:127.0.0.1
echo keyUsage = critical, digitalSignature, keyEncipherment
echo extendedKeyUsage = serverAuth
echo basicConstraints = critical, CA:false
) > %TEMP%\hexmesh.cnf

openssl req -x509 -newkey rsa:2048 ^
  -keyout %CERT_DIR%\key.pem ^
  -out  %CERT_DIR%\cert.pem ^
  -days 365 -nodes ^
  -config %TEMP%\hexmesh.cnf

echo.
echo Done! cert.pem and key.pem written to %CERT_DIR%
echo.
echo NOW on each phone open: https://%MY_IP%:3002/health
echo Accept the cert warning, then reload the app.
pause
