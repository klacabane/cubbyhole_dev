var Utils = require('../tools/utils'),
    Plan = require('../models/Plan'),
    Bandwidth = require('../models/Bandwidth');

var Cache = {
    store: {
        Plans: [],
        _plans: {},
        _bandwidths: {}
    },
    init: function (callback) {
        Bandwidth.find({}, 'download upload')
            .exec(function (err, bws) {
                Cache._addBandwidths(bws);

                Plan.find({}, 'bandwidth name price duration storage sharedQuota')
                    .exec(function (err, plans) {
                        Cache._addPlans(plans);
                        if (callback) callback();
                    });
            });
    },
    _addPlans: function (plans) {
        for (var i = 0, length = plans.length; i < length; i ++) {
            var plan = plans[i].toObject();
                plan.bandwidth = Cache.store._bandwidths[plan.bandwidth];

            delete plan.bandwidth._id;

            Cache.store._plans[plan._id] = plan;
            Cache.store.Plans.push(plan);
        }
    },
    _addBandwidths: function (bws) {
        for (var i = 0, length = bws.length; i < length; i ++) {
            var bw = bws[i].toObject();
            Cache.store._bandwidths[bw._id] = bw;
        }
    },
    getPlan: function (id) {
        return this.store._plans[id];
    }
};

module.exports = Cache;
