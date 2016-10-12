var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var session = require('express-session');
var bcrypt = require('bcrypt-nodejs');

var app = express();

app.use(session({secret: '1234', cookie: { maxAge: 60000 }}));

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

var sess;

app.get('/',
function(req, res) {
  sess = req.session;
  util.checkUser(sess.username, res);
  res.render('index');
});

app.get('/create',
function(req, res) {
  sess = req.session;
  util.checkUser(sess.username, res);
  res.render('index');
});

app.get('/links',
function(req, res) {
  sess = req.session;
  util.checkUser(sess.username, res);

  Links.reset().fetch().then(function(links) {
    var subset = links.models.filter(function(link) {
      return link.attributes.userId === sess.username;
    });
    res.status(200).send(subset);
  });
});

app.post('/links',
function(req, res) {
  sess = req.session;
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri, userId: sess.username }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin,
          userId: sess.username
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/
app.get('/login',
function(req, res) {
  res.render('login');
});

app.post('/login',
function(req, res) {
  // check if user is in database, then determine if it should be stored in session.
  new User({ username: req.body.username }).fetch().then(function(found) {
    if (found && bcrypt.compareSync(req.body.password, found.attributes.password)) {

      sess = req.session;
      sess.username = found.id;
      res.redirect('/');
    } else {
      res.redirect('/login');
    }
  });
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.post('/signup',
function(req, res) {
  Users.create({
    username: req.body.username,
    password: bcrypt.hashSync(req.body.password)
  })
  .then(function(user) {
    sess = req.session;
    sess.username = user.id;
    res.status(200).redirect('/');
  });
});

app.get('/logout',
function(req, res) {
  sess = req.session;
  sess.username = null;
  res.redirect('/login');
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
