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

const getUpcomingLiveID = async () => {
  try {
    axios.defaults.baseURL = 'https://www.googleapis.com/youtube/v3';
    const html = await axios.get('https://www.youtube.com/embed/live_stream?channel=' + channelId);
    const liveURL = html.data.match(/https:\/\/www\.youtube\.com\/watch\?v=[A-z0-9]+/)[0];
    const liveID = liveURL.split('=')[1];
    return {
      isSuccess: true,
      result: liveID,
    };

  } catch (res) {
    return {
      isSuccess: false,
      result: res,
    };
  }
};

const getUpcomingLiveInfo = async (liveID) => {
  try {
    axios.defaults.baseURL = 'https://www.googleapis.com/youtube/v3';
    const res = await axios.get('/videos?part=snippet&id=' + liveID + '&key=' + YTAPIKey);

    const item = res.data.items[0];
    const live = {
      IdUrl : YTURL + item.id,
      Title : item.snippet.title,
      thumb : item.snippet.thumbnails.high.url,
      time  : new Date(item.snippet.publishedAt),
    };

    return {
      isSuccess: true,
      result: live,
    };

  } catch (res) {
    return {
      isSuccess: false,
      result: res,
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
        isSuccess: true,
        result: {
          latestDate: {
            toDate: () => { return new Date('2020/1/1 0:00'); }
          },
          latestLiveID: 'xxxx',
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
    const ref = db.collection(channelId).doc(id);
    await ref.set(data)
    return {
      isSuccess: true,
    };
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

const tweetMessage = async (payload) => {
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

const broadcastLineMessage = async (payload) => {
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
// exports.main = functions.region('asia-northeast1').https.onRequest(async (request, response) => {
exports.main = functions.region('asia-northeast1').pubsub.schedule('every 1 minutes').onRun(async (request, response) => {
  // YouTubeから配信情報を取得
  const liveID = await getUpcomingLiveID();
  if (liveID.isSuccess === false) {
    // Fetch失敗時の処理
    response.send('配信ページの取得に失敗したらしい');
    return;
  }

  // DBから情報読んでくる
  const liveInfoFromStore = await readFireStore('liveInfo');
  if (liveInfoFromStore.isSuccess === false) {
    // Fetch失敗時の処理
    response.send('failed to read FireStore');
    return;
  }
  const latestLiveIDFromStore = liveInfoFromStore.result.latestLiveID;
  if (latestLiveIDFromStore === liveID.result) {
    // 前回と同じ配信枠だったのでなにもせず終了
    response.send('前回と同じ配信枠だったな……');
    return;
  }

  // 配信情報の取得
  const liveFromID = await getUpcomingLiveInfo(liveID.result);
  if (liveFromID.isSuccess === false) {
    // Fetch失敗時の処理
    response.send('配信情報の取得に失敗したっぽい');
    return;
  }

  const latestTimeFromStore = liveInfoFromStore.result.latestDate.toDate();
  if (latestTimeFromStore > liveFromID.result.time) {
    // 以前の配信枠より古いのでなにもせず終了
    response.send('たぶんフリーチャット引っ掛けたな……');
    return;
  }
  const LinePayload = createLineMessage([liveFromID.result]);
  await broadcastLineMessage(LinePayload);
  const TwitterPayload = createTwitterMessage([liveFromID.result]);
  await tweetMessage(TwitterPayload);

  // DBに情報書き込む
  const setFireStoreResult = await setFireStore('liveInfo', {
    latestDate: liveFromID.result.time,
    latestLiveID: liveID.result,
  });
  if (setFireStoreResult.isSuccess === false) {
    // set失敗時の処理
    response.send('failed to save FireStore');
    return;
  }

  response.send("OK!");
});
