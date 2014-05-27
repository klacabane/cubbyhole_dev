var Utils = require('../tools/utils'),
    User = require('../models/User'),
    Item = require('../models/Item'),
    multiparty = require('multiparty'),
    cfg = require('../config'),
    admZip = require('adm-zip'),
    easyZip = require('easy-zip').EasyZip,
    streamifier = require('streamifier'),
    Throttle = require('throttle'),
    fs = require('fs-extra');

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
    getItem: function (req, res, next) {
        Item.findOne({_id: req.params.id}, function (err, item) {
            if (err) return res.send(500);
            if (!item) return res.send(404);

            req.item = item;
            next();
        });
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
    },
    download: function (req, res) {
        var item = req.item;

        item.getDirPath(function (err, dirPath) {
            if (err) return res.send(500);

            var limit = req.dlLimit || 10000,
                filename = (item.type === 'file')
                    ? item.name
                    : item.name + '.zip';

            res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');

            if (item.type === 'file') {
                fs.createReadStream(dirPath)
                    .pipe(new Throttle(limit * 1024))
                    .pipe(res);
            } else {
                item.getChildren(function (err, childs) {
                    if (!childs.length) {
                        // adm-zip doesn't support empty folders
                        var zip = new easyZip();

                        zip.zipFolder(dirPath, function () {
                            zip.writeToResponse(res, item.name);
                        });
                    } else {
                        var zip = new admZip();
                        zip.addLocalFolder(dirPath);

                        zip.toBuffer(function (buffer) {
                            streamifier.createReadStream(buffer)
                                .pipe(new Throttle(limit * 1024))
                                .pipe(res);
                        });
                    }
                });
            }
        });
    }
}