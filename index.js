const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

async function scrapeDividendos(fiiCode) {
    const url = `https://www.fundsexplorer.com.br/funds/${fiiCode}`;

    const browser = await puppeteer.launch({
        ignoreHTTPSErrors: true,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });   
    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(0); 
    await page.goto(url, { waitUntil: 'load' });
    try {
        await page.waitForSelector('div.dividends');        

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
                    if (header == "Tipo")
                        continue;
                    
                    let value = record[index].indexOf("R$") > -1 ? record[index].replace("R$","").trim() : record[index];
                    obj[header] = value;
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
    console.log("Recebi request");
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
    console.log(`API rodando em ${PORT}`);
});
