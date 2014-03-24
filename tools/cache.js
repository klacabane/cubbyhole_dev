var Utils = require('../tools/utils'),
    Plan = require('../models/Plan'),
    Bandwidth = require('../models/Bandwidth');

var Cache = {
    store: {
        Plans: [],
        Bandwidths: [],
        _plans: {},
        _bandwidths: {}
    },
    init: function (callback) {
        this.store.Plans = [];
        this.store.Bandwidths = [];
        this.store._plans = {};
        this.store._bandwidths = {};
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

            Cache.store._plans[plan._id] = plan;
            Cache.store.Plans.push(plan);
        }
    },
    _addBandwidths: function (bws) {
        for (var i = 0, length = bws.length; i < length; i ++) {
            var bw = bws[i].toObject();
            Cache.store._bandwidths[bw._id] = bw;
            Cache.store.Bandwidths.push(bw);
        }
    },
    getPlan: function (id) {
        return this.store._plans[id];
    },
    getBandwidth: function (id) {
        return this.store._bandwidths[id];
    }
};

module.exports = Cache;
