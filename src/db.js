const mongoose = require('mongoose');
module.exports = () => {
    const connect = () => {
        mongoose.connect('mongodb://counter:counter@mongo/visit-counter', {
            socketTimeoutMS: 5000,
            keepAlive: true,
            reconnectTries: 30
        }, async (err) => {
            if (err) {
                console.error('mongodb connection error', err);
                process.exit(1); // restart server by docker-compose
            } else {
                console.info('mongodb connected');
            }
        });
        mongoose.Promise = global.Promise;
    };
    connect();
    require('./models/VisitorModel.js');
};