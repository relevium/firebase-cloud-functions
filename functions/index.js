const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp(
    {
        credential: admin.credential.cert(require('./serviceaccount.secret.json')),
        databaseURL: "https://relevium-maps.firebaseio.com"
    });

const db = admin.database();

const getUser = async (param) => {
    const allUsersRef = await db.ref('Users');
    const allUsersSnapshot = await allUsersRef.once('value');
    const allUsers = await allUsersSnapshot.val();
    for (x in allUsers)
        if (x === param)
            // if (allUsers[x]['mFirstName'] === name)
            return allUsers[x];
    // return 'NOTFOUND';
}



const measure = (lat1, lon1, lat2, lon2) => { //Haversine formula 
    let R = 6378.137; // Radius of earth in KM
    let dLat = lat2 * Math.PI / 180 - lat1 * Math.PI / 180;
    let dLon = lon2 * Math.PI / 180 - lon1 * Math.PI / 180;
    let a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    let d = R * c;
    return d; // KM
}

const getAllUsersIDWithinXKMfrom = async (distKM, lat, lon) => {
    const allUserLocationRef = await db.ref('User-Location');
    const allUserLocationSnapshot = await allUserLocationRef.once('value');
    const allUserLocation = await allUserLocationSnapshot.val();


    const userIDS = async () => {
        let res = [];
        for (x in allUserLocation)
            if (measure(allUserLocation[x]['l'][0], allUserLocation[x]['l'][1], lat, lon) <= distKM)
                res.push(x);
        return res;
    }

    return await userIDS();
}


const getFCMIDFromUserID = async userID => {
    const allFCMIDRef = await db.ref('FCM-ID');
    const allFCMIDSnapshot = await allFCMIDRef.once('value');
    const allFCMID = await allFCMIDSnapshot.val();

    const FCMID = async () => {
        for (x in allFCMID)
            if (x === userID)
                return allFCMID[x];
        return '*NOTFOUND*';
    }
    return await FCMID();
}


const getPingDetails = async hzid => {
    const allPingDetailsRef = await db.ref('Ping-Details');
    const allPingDetailsSnapshot = await allPingDetailsRef.once('value');
    const allPingDetails = await allPingDetailsSnapshot.val();

    const pingDetails = async () => {
        for (x in allPingDetails)
            if (x === hzid)
                return allPingDetails[x];
        return '*NOTFOUND*';
    }
    return await pingDetails();
}


const sendNotification = async (FCMID, msgtitle, msgbody) => {
    const payload = { notification: { title: msgtitle, body: msgbody } };
    admin.messaging().sendToDevice(FCMID, payload);

}

exports.onMessageCreate =
    functions.database.ref('/GeoFirePingLocations/{hazardID}')
        .onCreate(async (snapshot, context) => {
            const hazardID = context.params.hazardID;

            const hazardDetails = await getPingDetails(hazardID);
            const userWhoInitiatied = await getUser(hazardDetails['mUserID']);

            const coordinates = snapshot.val()['l'];
            const a = coordinates[0], b = coordinates[1];

            const hazardCONST = ['PIN!', 'FIRE!', 'WARNING!'];
            const hazardTYPE = hazardCONST[hazardDetails['mImageId'] - 1];


            if (hazardTYPE !== 'PIN!') {
                getAllUsersIDWithinXKMfrom(5, a, b).then(allusersids => {
                    for (userid of allusersids)
                        getFCMIDFromUserID(userid)
                            .then(fcm => sendNotification(fcm, 'CAREFUL ' + hazardTYPE, userWhoInitiatied['mFirstName'] + ' broadcasted a ...' + hazardDetails['mDescription']))
                            .catch(err => console.log(err))
                    return true;
                })
                    .catch(err => console.log(err));
            }
        });



