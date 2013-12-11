var mongoose = require('mongoose');

/* Properties */
var userPlanSchema = new mongoose.Schema({
	user: { type: mongoose.Schema.Types.ObjectId, ref: 'User'},
	plan: { type: Number, ref: 'Plan'},
	billingDate: { type: Date, default: Date.now },
	active: { type: Boolean, default: true }
});

/*
 * [ Statics ]
 */

/*
 * [ Methods ]
 */
	// setInactive
	userPlanSchema.methods.setInactive = function (callback) {
		this.update({ active: false }, function (err) {
			if (err) callback(err);
			callback();
		});
	};
module.exports = mongoose.model('UserPlan', userPlanSchema);