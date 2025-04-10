const express = require('express');
const path = require('path');
const app = express();

// Configurar EJS como view engine
app.set('view engine', 'ejs');
app.set('views', __dirname);

// Servir arquivos estáticos
app.use(express.static(__dirname));

// Rota principal
app.get('/', (req, res) => {
    res.render('index', {
        WEBSOCKET_URL: process.env.WEBSOCKET_URL
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor web rodando na porta ${PORT}`);
}); 