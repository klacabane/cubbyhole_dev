/*
 * GET home page
 */

exports.index = function(req, res){
  res.render('index');
};

/*
 * GET partial views
 */
exports.partials = function (req, res) {
    var folder = req.params.folder;
    var name = req.params.name;
    res.render('partials/' + folder + '/' + name);
};