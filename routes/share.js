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
     */
    app.post('/share', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.body.id,
            receiver = req.body.with,
            from = req.user,
            isPublic = req.isPublic == 'true';

        async.parallel({
            item: function (callback) {
                Item.findOne({_id: itemId}, callback);
            },
            recipient: function (callback) {
                User.findOne({_id: receiver}, callback);
            },
            from: function (callback) {
                User.findOne({_id: from}, callback);
            }
        }, function (err, results) {
            if (err) return res.send(500);
            if (!results.item || !results.recipient) return res.send(404);

            new ItemShare({item: itemId, with: receiver, from: from, public: isPublic})
                .save(function (err, itemShare) {
                    if (err) return res.send(500);

                    async.parallel([
                        function (cb) {
                            new Notification({
                                type: 'S',
                                user: receiver,
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

                            Utils.sendEmail(results.recipient, details, cb);
                        }
                    ], function (err) {
                        if (err) return res.send(500);
                        res.send(201, {
                           data: itemShare
                        });
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
