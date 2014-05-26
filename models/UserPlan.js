var mongoose = require('mongoose'),
    Plan = require('../models/Plan');

var userPlanSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan'},
    billingDate: { type: Date, default: Date.now },
    active: { type: Boolean, default: true },
    usage: {
        storage: {type: Number, default: 0},
        share: {type: Number, default: 0},         // kb
        bandwidth: {
            upload: {type: Number, default: 0},    // kb/s
            download: {type: Number, default: 0}   // kb/s
        }
    },
    isFree: Boolean
});

module.exports = mongoose.model('UserPlan', userPlanSchema);