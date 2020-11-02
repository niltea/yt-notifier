const functions = require('firebase-functions');
const {Firestore} = require('@google-cloud/firestore');

const axios = require('axios');
const line = require('@line/bot-sdk');
const Twitter = require('twitter');
const db = new Firestore();

// 変数初期化
const YTURL = 'https://www.youtube.com/watch?v=';
const credential = require('./credentials');
const YTAPIKey = credential.YTAPIKEY;
const channelId = credential.CID;

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
    return {
      isSuccess: true,
      result: lives,
    };

  } catch (res) {
    return {
      isSuccess: false,
      result: res.response.data,
    };
  }
};

const readFireStore = async (id) => {
  try {
    const doc = await db
      .collection(channelId)
      .doc(id)
      .get();
    if (!doc.exists) {
      return {
        isSuccess: false,
        result: {
          latestDate: {
            toDate: () => { return new Date('2020/1/1 0:00'); }
          }
        },
      };
    }
    return {
      isSuccess: true,
      result: doc.data(),
    };
  } catch (error) {
    return {
      isSuccess: false,
      result: error,
    };
  }
}

const setFireStore = async (id, data) => {
  try {
    const doc = await db
      .collection(channelId)
      .doc(id)
      .update(data);
    return true;
  } catch (error) {
    console.error(error);
    return {
      isSuccess: false,
      result: error,
    };
  }
}

const createLineMessage = (NewArrival) => {
  const payload = [];
  NewArrival.forEach((item) => {
    payload.push({
      title: item.Title,
      data: {
        "type": "bubble",
        "hero": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "text",
              "text": "配信枠ができたよ〜ん",
              "size": "xl",
              "weight": "bold",
              "align": "center",
            }
          ],
          "paddingAll": "md",
          "paddingTop": "xl",
          "paddingBottom": "lg"
        },
        "body": {
          "type": "box",
          "layout": "vertical",
          "contents": [
            {
              "type": "image",
              "url": item.thumb,
              "size": "full",
              "aspectRatio": "4:3",
              "aspectMode": "cover",
              "action": {
                "type": "uri",
                "uri": item.IdUrl
              }
            },
            {
              "type": "box",
              "layout": "vertical",
              "contents": [
                {
                  "type": "text",
                  "text": item.Title,
                  "wrap": true,
                  "size": "sm"
                }
              ],
              "paddingAll": "lg",
              "paddingTop": "xl",
              "paddingBottom": "xl"
            }
          ],
          "paddingAll": "none"
        },
        "footer": {
          "type": "box",
          "layout": "vertical",
          "spacing": "sm",
          "contents": [
            {
              "type": "button",
              "style": "link",
              "height": "sm",
              "action": {
                "type": "uri",
                "label": "配信を見る ＞",
                "uri": item.IdUrl
              },
              "color": "#ffffff"
            }
          ],
          "flex": 0,
          "paddingAll": "none",
          "backgroundColor": "#17c950"
        }
      },
    });
  });
  return payload;
};

const createTwitterMessage = (NewArrival) => {
  const payload = [];
  NewArrival.forEach((item) => {
    payload.push({
      title: item.Title,
      data: {
        status: `配信枠ができたよ〜ん\nタイトル: ${item.Title}\nURL: ${item.IdUrl}`,
      },
    })
  });
  return payload;
};

tweetMessage = async (payload) => {
  const config = {
    consumer_key: credential.TW_APIKEY,
    consumer_secret: credential.TW_APISECRET,
    access_token_key: credential.TW_TOKEN,
    access_token_secret: credential.TW_SECRET,
  };
  const tw = new Twitter(config);

  await Promise.all(payload.map(async item => {
    try {
      tw.post('statuses/update', item.data);
    } catch (err) {
      console.log(err);
    }
  }));
};

broadcastLineMessage = async (payload) => {
  const client = new line.Client({
    channelSecret: credential.LINE_SECRET,
    channelAccessToken: credential.LINE_TOKEN,
  });

  await Promise.all(payload.map(async message => {
    try {
      await client.broadcast({
        "type": "flex",
        "altText": `新しい枠ができたよ〜ん ⇒${message.title}`,
        "contents": message.data
      })
    } catch (err) {
      console.log(err)
    }
  }));
}

exports.main = functions.https.onRequest(async (request, response) => {
  // YouTubeから配信情報を取得
  const lives = await getUpcomingLive();
  if (lives.isSuccess === false) {
    // Fetch失敗時の処理
    response.send(lives.result.error);
    return false;
  }

  // DBから情報読んでくる
  const liveInfo = await readFireStore('liveInfo');
  if (liveInfo.isSuccess === false) {
    // Fetch失敗時の処理
    response.send('failed to read FireStore');
    return false;
  }
  const latestTime = liveInfo.result.latestDate.toDate();
  const NewArrival = lives.result.filter(live => live.time > latestTime);
  // const NewArrival = [lives.result[0]];

  if (NewArrival.length !== 0) {
    const LinePayload = createLineMessage(NewArrival);
    await broadcastLineMessage(LinePayload);
    const TwitterPayload = createTwitterMessage(NewArrival);
    await tweetMessage(TwitterPayload);

    // 最新枠の日時を抽出
    const latestTimeFromFetch = lives.result.map(live => live.time).sort()[0];
    // DBに情報書き込む
    await setFireStore('liveInfo', { latestDate: latestTimeFromFetch });
  }

  response.send("OK!");
});
