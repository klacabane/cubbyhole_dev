var User = require('../models/User'),
    Item = require('../models/Item'),
    mw = require('../tools/middlewares');

module.exports = function (app) {
    /*
     *  POST
     *  make the resource public
     */
    app.post('/link/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id;
        Item.findOne({_id: itemId}, function (err, item) {
            if (err) return res.send(500);
            if (!item) return res.send(404);

            User.hasPermissions({user: req.user, item: item, permissions: 1}, function (err, ok) {
                if (err) return res.send(500);
                if (!ok) return res.send(403);

                item.isPublic = true;
                item.lastModified = Date.now();
                item.link = {
                    url: '/sh/' + item._id,
                    creationDate: Date.now()
                };

                item.save(function (err, uitem) {
                    if (err) return res.send(500);

                    res.send(200, {
                        data: uitem
                    });
                });
            });
        });
    });

    /*
     *  DELETE
     */
    app.delete('/link/:id', mw.checkAuth, mw.validateId, function (req, res) {
        var itemId = req.params.id,
            user = req.user;
        Item.findOne({_id: itemId}, function (err, item) {
            if (err) return res.send(500);
            if (!item) return res.send(404);

            User.hasPermissions({user: user, item: item, permissions: 1}, function (err, ok) {
                if (err) return res.send(500);
                if (!ok) return res.send(403);

                item.isPublic = false;
                item.link = {};
                item.lastModified = Date.now();
                item.save(function (err) {
                    if (err) return res.send(500);

                    res.send(200);
                });
            });
        });
    });
};
