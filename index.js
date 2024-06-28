import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { spawn } from 'child_process';
import { Buffer } from 'buffer';
import data from './languages.json' assert { type: 'json' };

const apiKeygoogle = 'AIzaSyBzjXZGMM-JrANGX50UL10w4UhYUEli-AI';
const apiKeyvoice = '9330551ae29f4fc4a7683857044fe778';
const options = { method: 'GET' };

const app = express();
const port = 3000;
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Ensure JSON parsing for POST requests

function runPythonScript(inputData) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn('python', ['summ.py']);

    let outputData = '';

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
      reject(data.toString());
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        resolve(outputData);
      } else {
        reject(`Process exited with code: ${code}`);
      }
    });

    pythonProcess.stdin.write(inputData);
    pythonProcess.stdin.end();
  });
}

let audioBuffer = null;

app.get("/", (req, res) => {
  res.render("index.ejs", { voicefile: audioBuffer ? "/audio" : null });
});

app.get("/audio", (req, res) => {
  if (audioBuffer) {
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } else {
    res.status(404).send("Audio not found");
  }
});

const splitTextIntoChunks = (text, maxWords) => {
  if (typeof text !== 'string') {
    throw new TypeError('Expected text to be a string');
  }

  const words = text.split(' ');
  const chunks = [];
  let chunk = [];

  for (const word of words) {
    if (chunk.length + 1 > maxWords) {
      chunks.push(chunk.join(' '));
      chunk = [];
    }
    chunk.push(word);
  }
  if (chunk.length > 0) {
    chunks.push(chunk.join(' '));
  }
  return chunks;
};

const translateChunks = async (chunks, targetLang) => {
  const translatedChunks = [];

  for (const chunk of chunks) {
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKeygoogle}&target=${targetLang}&q=${encodeURIComponent(chunk)}`, options);
    if (!response.ok) {
      throw new Error(`Google Translate API error: ${response.statusText}`);
    }
    const data = await response.json();
    translatedChunks.push(data.data.translations[0].translatedText);
  }
  return translatedChunks.join(' ');
};

// Function to fetch and concatenate audio chunks
const fetchAndConcatAudioChunks = async (text,lang) => {
  const chunks = splitTextIntoChunks(text, 20);
  const audioBuffers = [];

  for (const chunk of chunks) {
    const voiceUrl = `http://api.voicerss.org/?key=${apiKeyvoice}&f=16khz_16bit_stereo&c=MP3&hl=${lang}&src=${encodeURIComponent(chunk)}`;
    const voiceResponse = await fetch(voiceUrl);

    if (!voiceResponse.ok) {
      throw new Error(`Voice RSS API error: ${voiceResponse.statusText}`);
    }

    const buffer = await voiceResponse.buffer();
    audioBuffers.push(buffer);
  }

  return Buffer.concat(audioBuffers);
};

app.post("/redirect", async (req, res) => {
  try {
    const textToSummarize = req.body.texttobesumm;
    console.log(req.body.langToBeSumm);
    const langToSummarize= data[req.body.langToBeSumm];
    if(!data.hasOwnProperty(req.body.langToBeSumm)){
    res.redirect("/");

    }

    if (!textToSummarize) {
      throw new Error('texttobesumm is undefined or null');
    }
    console.log(langToSummarize[0].transLang);
    const chunksToTranslate = splitTextIntoChunks(textToSummarize, 800);
    const enTextToSumm = await translateChunks(chunksToTranslate, "en");

    const output = await runPythonScript(enTextToSumm);
    console.log(`Raw output from Python script: ${output}`);

    let summarizedText;
    try {
      summarizedText = JSON.parse(output).summary_text;
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${output}`);
    }

    const chunksToTranslateBack = splitTextIntoChunks(summarizedText, 800);
    const translatedText = await translateChunks(chunksToTranslateBack, langToSummarize[0].transLang);
    console.log(translatedText);

    audioBuffer = await fetchAndConcatAudioChunks(translatedText,langToSummarize[0].voiceLang);
    res.redirect("/");
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send("Internal Server Error");
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.listen(port, () => {
  console.log(`Server running on port: ${port}`);
});
