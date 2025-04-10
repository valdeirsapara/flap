#!/bin/bash

# Criar diretórios necessários
mkdir -p certbot/conf
mkdir -p certbot/www

# Iniciar Nginx temporariamente para validação do domínio
docker-compose up -d nginx

# Aguardar Nginx iniciar
sleep 5

# Obter certificado
docker-compose run --rm certbot

# Reiniciar Nginx com SSL
docker-compose down
docker-compose up -d 