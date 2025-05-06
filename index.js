const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

async function scrapeDividendos(fiiCode) {
    const url = `https://www.fundsexplorer.com.br/funds/${fiiCode}`;

    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });  
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    try {
        await page.waitForSelector('div.dividends', { timeout: 10000 });        

        const dividendsData = await page.evaluate(() => {
            const div = document.querySelector('div.dividends');
            
            return div ? div.innerText : null;
        });
        
        const lines = dividendsData.split('\n');
        const headers = lines.slice(0, 6); // ["Tipo", "Data com", ..., "Yield (%)"]
        const dataLines = lines.slice(6).filter(l => !l.startsWith("Ver todos os"));

        const result = [];
        for (let i = 0; i < dataLines.length; i += 6) {
            const record = dataLines.slice(i, i + 6);
            if (record.length === 6) {
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header] = record[index];
                });
                result.push(obj);
            }
        }

        await browser.close();
        return result;
    } catch (err) {
        await browser.close();
        throw new Error('Erro ao carregar a tabela de dividendos');
    }
}

app.get('/dividendos/:fiiCode', async (req, res) => {
    const fiiCode = req.params.fiiCode.toUpperCase();

    try {
        const dividendos = await scrapeDividendos(fiiCode);
        if (dividendos.length === 0) {
            return res.status(404).json({ error: 'Nenhuma informação encontrada para esse FII.' });
        }
        res.json(dividendos);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`API rodando em http://localhost:${PORT}`);
});