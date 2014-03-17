var mongoose = require('mongoose'),
    Plan = require('../models/Plan');

/* Properties */
var userPlanSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
	plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan'},
	billingDate: { type: Date, default: Date.now },
	active: { type: Boolean, default: true },
    usage: {
        storage: {type: Number, default: 60},
        share: {type: Number, default: 40},
        bandwidth: {
            upload: {type: Number, default: 20},
            download: {type: Number, default: 25}
        }
    }
});

module.exports = mongoose.model('UserPlan', userPlanSchema);