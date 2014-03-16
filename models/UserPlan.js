var mongoose = require('mongoose'),
    Plan = require('../models/Plan');

/* Properties */
var userPlanSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
	plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan'},
	billingDate: { type: Date, default: Date.now },
	active: { type: Boolean, default: true }
});

module.exports = mongoose.model('UserPlan', userPlanSchema);