'use strict';

const axios = require('axios');
const line = require('@line/bot-sdk');

// const PORT = process.env.PORT || 3000;
const YTURL = 'https://www.youtube.com/watch?v=';
const YTAPIKey = process.env.YTAPIKey;
const channelId = process.env.CID;

const LINEConfig = {
  channelSecret: process.env.LINE_SECRET,  //作成したBotのチャネルシークレット
  channelAccessToken: process.env.LINE_TOKEN, //作成したBotのチャネルアクセストークン
};
const client = new line.Client(LINEConfig);

const getUpcomingLive = async () => {
  try {
    const lives = [];
    axios.defaults.baseURL = 'https://www.googleapis.com/youtube/v3';
    const res = await axios.get('/search?part=snippet&eventType=upcoming&type=video&channelId=' + channelId + '&key=' + YTAPIKey);
    // const res = await axios.get('/search?part=snippet&eventType=completed&type=video&channelId=' + channelId + '&key=' + YTAPIKey);

    res.data.items.forEach((item) => {
      lives.push({
        Title : item.snippet.title,
        IdUrl : YTURL + item.id.videoId,
        thumb : item.snippet.thumbnails.high.url,
        time  : new Date(item.snippet.publishTime),
      });
    });
    return lives;

  } catch (error) {
    console.error(error);
  }
};

const issueMessage = (NewArrival) => {
  const columns = [];
  NewArrival.forEach((item) => {
    columns.push({
      "thumbnailImageUrl": item.thumb,
      "text": item.Title,
      "defaultAction": {
        "type": "uri",
        "label": "動画を見に行く",
        "uri": item.IdUrl,
      },
      "actions": [
        {
          "type": "uri",
          "label": "動画を見に行く",
          "uri": item.IdUrl,
        }
      ]
    })
  });
  return client.broadcast({
    "type": "template",
    "altText": "新着動画だよ〜ん",
    "template": {
      "type": "carousel",
      columns,
      "imageAspectRatio": "rectangle",
      "imageSize": "cover"
    }
  });
};

const main = async () => {
  const lives = await getUpcomingLive();
  // const newest = lives.map(live => live.time).sort().slice(-1);
  const dummy = new Date("2020-09-01T22:41:32.000Z");
  const NewArrival = lives.filter(live => live.time > dummy);

  issueMessage(NewArrival);

  return null;
};
main();
