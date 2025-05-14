require('dotenv').config();

const express = require('express');
const puppeteer = require('puppeteer');
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL); // padrão: localhost:6379
const app = express();
const PORT = process.env.PORT || 3000;

async function scrapeDetails(fiiCode) {
    const cacheKey = `fii:${fiiCode}`;

    try {
        const url = `https://www.fundsexplorer.com.br/funds/${fiiCode}`;

        const browser = await puppeteer.launch({
            headless: "new", // ou true
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage', // evita problemas de memória compartilhada
                '--single-process',
                '--no-zygote']
        });   
        const page = await browser.newPage();

        page.setDefaultNavigationTimeout(0); 
        await page.goto(url, { waitUntil: 'load' });

        await page.waitForSelector('div.indicators');        

        const details = await page.evaluate(() => {
            const div = document.querySelector('div.indicators');
            return div ? div.innerText : null;
        });

        if (!details) throw new Error("Div 'indicators' não encontrada");

        let replaced = details.replace(/últ\. 12 meses\n\n|por cota\n\n/g, "");
        let output = replaced.split("\n\n");
        let parsed = {};         

        for (let i = 0; i < output.length; i += 2) {
            const key = output[i];
            const value = output[i + 1];
            parsed[key] = value.replace(",", ".");
        }

        await browser.close();

        // Salva no Redis (TTL de 10 dias = 864000 segundos)
        await redis.set(cacheKey, JSON.stringify(parsed), 'EX', 864000);

        return parsed;

    } catch (err) {
        console.error(`Erro ao buscar dados com Puppeteer: ${err.message}`);

        // Tenta buscar no Redis
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log(`🔁 Retornando dados em cache para ${fiiCode}`);
            return JSON.parse(cached);
        }

        throw new Error('Erro ao carregar dados e nenhum cache disponível.');
    }
}

async function scrapeDividendos(fiiCode) {
    const url = `https://www.fundsexplorer.com.br/funds/${fiiCode}`;
    const cacheKey = `dividendos:${fiiCode}`;

    try {
        const browser = await puppeteer.launch({
            headless: "new", // ou true
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage', // evita problemas de memória compartilhada
                '--single-process',
                '--no-zygote']
        });  
        const page = await browser.newPage();

        page.setDefaultNavigationTimeout(0); 
        await page.goto(url, { waitUntil: 'load' });

        await page.waitForSelector('div.dividends');        

        const dividendsData = await page.evaluate(() => {
            const div = document.querySelector('div.dividends');
            return div ? div.innerText : null;
        });

        if (!dividendsData) throw new Error("Dados de dividendos não encontrados");

        const lines = dividendsData.split('\n');
        const headers = lines.slice(0, 6); // ["Tipo", "Data com", ..., "Yield (%)"]
        const dataLines = lines.slice(6).filter(l => !l.startsWith("Ver todos os"));

        const result = [];
        for (let i = 0; i < dataLines.length; i += 6) {
            const record = dataLines.slice(i, i + 6);
            if (record.length === 6) {
                const obj = {};
                headers.forEach((header, index) => {
                    if (header !== "Tipo") {
                        let value = record[index].includes("R$") ? record[index].replace("R$", "").trim() : record[index];
                        obj[header] = value;
                    }
                });
                result.push(obj);
            }
        }

        await browser.close();

        // Salva no Redis (TTL de 10 dias = 864000 segundos)
        await redis.set(cacheKey, JSON.stringify(parsed), 'EX', 864000);

        return result;

    } catch (err) {
        console.error(`Erro ao buscar dividendos: ${err.message}`);

        // ❌ Tenta buscar do cache
        const cached = await redis.get(cacheKey);
        if (cached) {
            console.log(`🔁 Retornando dividendos de cache para ${fiiCode}`);
            return JSON.parse(cached);
        }

        throw new Error('Erro ao carregar dividendos e nenhum cache disponível.');
    }
}

app.get('/pvp/:fiiCode', async (req, res) => {
    const fiiCode = req.params.fiiCode.toUpperCase();

    try {
        const detalhes = await scrapeDetails(fiiCode);
        if (detalhes.length === 0) {
            return res.status(404).json({ error: 'Nenhuma informação encontrada para esse FII.' });
        }

        res.send(detalhes["P/VP"]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/dividendos/:fiiCode', async (req, res) => {
    const fiiCode = req.params.fiiCode.toUpperCase();

    try {
        const detalhes = await scrapeDetails(fiiCode);
        if (detalhes.length === 0) {
            return res.status(404).json({ error: 'Nenhuma informação encontrada para esse FII.' });
        }
        let value = detalhes["Último Rendimento"].replace("R$","");        
        
        res.send(value);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/dividendos/data/com/:fiiCode', async (req, res) => {
    const fiiCode = req.params.fiiCode.toUpperCase();

    try {
        const dividendos = await scrapeDividendos(fiiCode);
        if (dividendos.length === 0) {
            return res.status(404).json({ error: 'Nenhuma informação encontrada para esse FII.' });
        }
        
        let value = dividendos[0]["Data com"];

        res.send(value);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/dividendos/data/pgto/:fiiCode', async (req, res) => {
    const fiiCode = req.params.fiiCode.toUpperCase();

    try {
        const dividendos = await scrapeDividendos(fiiCode);
        if (dividendos.length === 0) {
            return res.status(404).json({ error: 'Nenhuma informação encontrada para esse FII.' });
        }

        let value = dividendos[0]["Pagamento"];

        res.send(value);
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`API rodando em ${PORT}`);
});
