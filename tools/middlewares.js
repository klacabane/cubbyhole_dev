var Utils = require('../tools/utils'),
    User = require('../models/User'),
    multiparty = require('multiparty'),
    cfg = require('../config');

module.exports = {
    checkAuth: function (req, res, next) {
        var token = req.get('X-Cub-AuthToken') || req.params.token;

        if (token === undefined || !Utils.isTokenValid(token)) return res.send(401);

        req.user = Utils.getTokenUser(token);
		next();
    },
    validateId: function (req, res, next) {
        var id = req.params.id || req.body.id;

        if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) return res.send(400);

        next();
    },
    setHeaders: function (req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With, X-Cub-AuthToken, Content-Type");
        res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

        next();
    },
    isAdmin: function (req, res, next) {
        User.findOne({_id: req.user, isAdmin: true}, function (err, admin) {
            if (err) return res.send(500);
            if (!admin) return res.send(403);

            next();
        });
    },
    handleMultipart: function (req, res, next) {
        if (req.get('content-type').indexOf('multipart/form-data') > -1) {
            var form = new multiparty.Form({uploadDir: cfg.storage.dir});

            form.parse(req, function (err, fields, files) {
                if (err) return next(err);

                req.parentId = fields.parent[0];
                req.files = [];
                for (var fileName in files) {
                    req.files.push(files[fileName][0]);
                }
                next();
            });
        } else {
            next();
        }
    }
}