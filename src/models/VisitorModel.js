const mongoose = require('mongoose');

const visitorSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: false,
            trim: true,
            maxlength: 512,
        },
        address: {
            type: String,
            required: true,
            unique: false,
            trim: true,
            maxlength: 15,
        },
        visitedDate: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Visitors', visitorSchema);