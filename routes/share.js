var ItemShare = require('../models/ItemShare'),
    Item = require('../models/Item'),
    User = require('../models/User'),
    Notification = require('../models/Notification'),
    mw = require('../tools/middlewares'),
    Utils = require('../tools/utils'),
    async = require('async');

module.exports = function (app) {
    /*
     * POST
     *
     */
    app.post('/share', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.body.id,
            receivers = req.body.with,
            from = req.user,
            isPublic = req.isPublic == 'true';

        async.parallel({
            item: function (callback) {
                Item.findOne({_id: itemId})
                    .populate('owner')
                    .exec(callback);
            },
            recipients: function (callback) {
                var fn = [];
                receivers.forEach(function (r) {
                    fn.push(function (cb) {
                        User.findOne({mail: r.email})
                            .lean()
                            .exec(function (err, u) {
                                if (err) return cb(err);
                                if (!u || u._id.toString() === from) return cb();

                                ItemShare.findOne({$or: [{from: u._id}, {with: u._id}], item: itemId}, function (err, ishare) {
                                    if (err) return cb(err);
                                    if (ishare) return cb();

                                    u.permissions = r.permission;
                                    cb(null, u);
                                });
                            });
                    });
                });

                async.parallel(fn, callback);
            },
            from: function (callback) {
                User.findOne({_id: from}, callback);
            }
        }, function (err, results) {
            if (err) return res.send(500);
            if (!results.item || !results.recipients) return res.send(404);

            var notesFn = [],
                item = results.item;
            results.recipients.forEach(function (recip) {
                if (recip) {
                    notesFn.push(function (callback) {
                        new ItemShare({item: itemId, with: recip._id, owner: {_id: item.owner._id, email: item.owner.mail}, permissions: recip.permissions, public: isPublic})
                            .save(function (err, itemShare) {
                                if (err) return callback(err);

                                async.parallel([
                                    function (cb) {
                                        new Notification({
                                            type: 'S',
                                            user: recip._id,
                                            from: from,
                                            item: {name: results.item.name, type: results.item.type},
                                            share: itemShare._id
                                        }).save(cb);
                                    },
                                    function (cb) {
                                        var details = {
                                            item: results.item,
                                            from: results.from,
                                            share: itemShare._id
                                        };

                                        Utils.sendEmail(recip, details, cb);
                                    }
                                ], function (err) {
                                    if (err) return callback(err);
                                    callback(null, itemShare);
                                });
                            });
                    });
                }
            });

            async.parallel(notesFn, function (err, itemShares) {
                if (err) return res.send(500);
                if (itemShares.length > 0) {
                    item.isShared = true;
                    item.save();
                }
                res.send(201, {
                    data: itemShares
                });
            });
        });
    });

    /*
     * GET
     */
    app.get('/share/:id', mw.validateId, function (req, res) {
        ItemShare.findOne({_id: req.params.id})
            .populate('item')
            .exec(function (err, itemShare) {
                if (err) return res.send(500);
                if (!itemShare) return res.send(404);

                if (itemShare.public)
                    res.send(201, {
                        data: ishare.item
                    });
                else
                    mw.checkAuth(req, res, function () {
                        if (req.user !== itemShare.with.toString()) return res.send(403);

                        res.send(201, {
                            data: itemShare.item
                        });
                    });
            });
    });

    app.get('/share', mw.checkAuth, function (req, res) {
        var user = req.user;
        ItemShare.find({$or: [{'owner._id': user}, {'with': user}]})
            .populate('item')
            .exec(function (err, shares) {
                if (err) return res.send(500);

                var fn = [],
                    itemsId = [];
                shares.forEach(function (s) {
                    if (itemsId.indexOf(s.item.toString()) === -1) {    // hmmm
                        itemsId.push(s.item.toString());

                        fn.push(function (cb) {
                            s.formatWithMembers(function (err, obj) {
                                if (err) return cb(err);

                                if (s.owner._id != user)
                                    cb(null, obj);
                                else
                                    s.item.getDirPath(function (err, path) {
                                        if (err) return cb(err);
                                        var p = path.split('/');
                                        p.splice(0, 2, 'My Cubbyhole');
                                        obj.path = p.join(',');

                                        cb(null, obj);
                                    });
                            });
                        });
                    }
                });

                async.parallel(fn, function (err, sharedItems) {
                    if (err) return res.send(500);
                    res.send(200, {
                        data: sharedItems
                    });
                });
            });
    });

    /*
     * DELETE
     */
    app.delete('/share/:id', mw.checkAuth, mw.validateId, function (req, res) {

    });

    /*
     * PUT
     */
    app.put('/share/:id', mw.checkAuth, mw.validateId, function (req, res) {
        ItemShare.findOne({_id: req.params.id}, function (err, itemShare) {
            if (err) return res.send(500);
            if (!itemShare) return res.send(404);
            if (req.user !== itemShare.with.toString()) return res.send(403);

            itemShare.accepted = true;
            itemShare.save(function (err) {
                if (err) return res.send(500);
                res.send(200);
            });
        });
    });
};
