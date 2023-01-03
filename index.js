const express = require("express");
const axios = require("axios");
var https = require("https");
var http = require("http");
const { exec } = require("child_process");
const app = express();
const dns = require("dns");
const fetch = require("node-fetch");
const path = require("path");
var ping = require("ping");
const bodyParser = require("body-parser");
const puppeteer = require("puppeteer");
const IP_INTERVAL_UPDATE = 1000 * 60 * 2.5; //every 5 minutes update ip
const MOTO_INTERVAL = 1000 * 60 * 15;

const windowOS = true;

let base = "/home/pi/";
const infos = [];
let HONDA_URL = "https://www.honda-motorcycles.gr/range/FORZA350/technical/";
let SYM_URL = "https://sym.gr/model/cruisym-a-300/";
let KYMCO_URL = "https://kymco.gr/product/xciting-s-400i-abs-tcs-noodoe-e5/";

app.use(express.static(windowOS ? "public" : base + "/server/" + "public"));
app.use(express.json());
require("dotenv").config();
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());

const sleep = (ms) => {
  return new Promise((rs) => setTimeout(rs, ms));
};

let pcStatus = false;
const GOOVE_API_KEY = process.env.GOOVE_API_KEY;

//
//
//
//

async function priceTitle(url, page) {
  await page.goto(url, { timeout: 0 });

  const infos = await page.evaluate((url) => {
    console.log(url);
    let price, title;

    if (url.startsWith("https://kym")) {
      price = document.querySelector(
        'span[class="d-block d-lg-inline-block font-weight-bolder font-36"]'
      ).innerText;

      title = document
        .querySelector(
          'div[class="background-cover featured-image text-center text-white"]'
        )
        .childNodes[0].innerText.split("\n")[0];
    } else if (url.startsWith("https://sym")) {
      price = document.querySelector('div[class="avia_textblock"]')
        .childNodes[0].innerText;

      title = document.querySelector(
        'h3[class="av-special-heading-tag"]'
      ).innerText;
    } else if (url.startsWith("https://www.honda")) {
      price = document.querySelector(
        `div[class="match-height-grades technical active"]`
      ).childNodes[3].innerText;

      title = document.querySelector(
        `div[class="match-height-grades technical active"]`
      ).childNodes[1].innerText;
    }
    return { title, price };
  }, url);
  return infos;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    devtools: false,
    defaultViewport: false,
    executablePath: windowOS ? "" : "/usr/bin/chromium-browser",
    userDataDir: "./tmp",
    args: [
      "--disable-canvas-aa",
      "--disable-2d-canvas-clip-aa",
      "--disable-gl-drawing-for-tests",
      "--disable-dev-shm-usage",
      "--no-zygote",
      "--use-gl=swiftshader",
      "--enable-webgl",
      "--hide-scrollbars",
      "--mute-audio",
      "--no-first-run",
      "--disable-infobars",
      "--disable-breakpad",

      "--window-size=1280,1024",
      "--user-data-dir=./chromeData",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });
  const page = await browser.newPage();
  try {
    infos.push({
      data: await priceTitle(HONDA_URL, page),
      timeStamp: new Date().toLocaleString(),
      img: "/images/honda.jpg",
      url: HONDA_URL,
    });
    infos.push({
      data: await priceTitle(SYM_URL, page),
      timeStamp: new Date().toLocaleString(),
      img: "/images/sym.jpg",
      url: SYM_URL,
    });
    infos.push({
      data: await priceTitle(KYMCO_URL, page),
      timeStamp: new Date().toLocaleString(),
      img: "/images/kymco.jpg",
      url: KYMCO_URL,
    });
    console.log(infos[2]);
  } catch (err) {}

  do {
    await sleep(MOTO_INTERVAL);
    try {
      infos[0].data = await priceTitle(HONDA_URL, page);
      infos[0].timeStamp = new Date().toLocaleString();
      infos[1].data = await priceTitle(SYM_URL, page);
      infos[1].timeStamp = new Date().toLocaleString();
      infos[2].data = await priceTitle(KYMCO_URL, page);
      infos[2].timeStamp = new Date().toLocaleString();
    } catch (err) {}
  } while (true);

  await browser.close();
})();

//
//
//
//

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/page.html"));
});

app.get("/status", async (req, res) => {
  const pingResp = await ping.promise.probe("192.168.1.100");
  pcStatus = pingResp.alive;
  res.json({ status: pcStatus });
});

app.get("/on", async (req, res) => {
  exec(`sudo ${__dirname}/s.sh`, (error, stdout, stderr) => {
    console.log(`stdout: ${stdout}`);
  });
  res.send("ok");
});

app.get("/off", async (req, res) => {
  await fetch("http://192.168.1.100:9996/1337/off");
  res.send("ok");
});

app.get("/api/getDevices", async (req, res) => {
  const header = { "Govee-API-Key": GOOVE_API_KEY };
  const resp = await fetch("https://developer-api.govee.com/v1/devices", {
    headers: header,
  });
  if (resp.status && resp.status == 200) {
    const data = await resp.json();
    console.log(data.data.devices);
    res.json({
      status: 200,
      data: data.data.devices.map((device) => {
        return { device: device.device, model: device.model };
      }),
    });
  } else {
    res.json({ status: 400 });
  }
});

app.get("/api/getDeviceState", async (req, res) => {
  const device = req.query.device;
  const model = req.query.model;

  console.log(device, model);
  const header = { "Govee-API-Key": GOOVE_API_KEY };
  const resp = await fetch(
    "https://developer-api.govee.com/v1/devices/state?device=" +
      device +
      "&model=" +
      model,
    { headers: header }
  );
  if (resp.status && resp.status == 200) {
    const data = await resp.json();
    res.json(data);
  } else {
    res.json({ status: 404 });
  }
});

app.put("/api/deviceControl", async (req, res) => {
  const body = {
    device: req.body.device,
    model: req.body.model,
    cmd: req.body.cmd,
  };
  const headers = {
    "Govee-API-Key": GOOVE_API_KEY,
    "content-type": "application/json",
  };

  const resp = await fetch(
    "https://developer-api.govee.com/v1/devices/control",
    {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    }
  );

  if (res.status && resp.status == 200) {
    const data = await resp.json();
    res.json(data);
  } else {
    res.json({ status: 400 });
  }
});

app.get("/api/motos", async (req, res) => {
  res.status(200).json(infos);
});

http.createServer({}, app).listen(3000, async () => {
  console.log("server is running");
});
