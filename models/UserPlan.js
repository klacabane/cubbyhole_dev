var mongoose = require('mongoose');

/* Properties */
var userPlanSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
	plan: { type: Number, ref: 'Plan'},
	billingDate: { type: Date, default: Date.now },
	active: { type: Boolean, default: true }
});

module.exports = mongoose.model('UserPlan', userPlanSchema);