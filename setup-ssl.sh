#!/bin/bash

# Instalar Certbot se não estiver instalado
if ! command -v certbot &> /dev/null; then
    echo "Instalando Certbot..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
fi

# Obter certificado SSL
echo "Obtendo certificado SSL..."
certbot certonly --standalone -d seu-dominio.com -d www.seu-dominio.com

# Configurar renovação automática
echo "Configurando renovação automática..."
(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet") | crontab -

echo "Configuração SSL concluída!" 