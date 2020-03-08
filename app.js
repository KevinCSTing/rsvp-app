//jshint esversion:6

//required libraries
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const { check, validationResult } = require('express-validator');
const mongoose = require("mongoose");
const _ = require('lodash');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

const saltRounds = 10;

const app = express();

//global flags
let isLoggedIn = false;
let isAdmin = false;

app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

//cookie
app.use(cookieParser());

//Sessions
app.use(session({
  secret: process.env.SECRET,
  resave: true,
  saveUninitialized: true

}));

//Express Messages Middleware
app.use(require('connect-flash')());
app.use(function (req, res, next) {
  res.locals.messages = require('express-messages')(req, res);
  next();
});

//passport
app.use(passport.initialize());
app.use(passport.session());

/*************************************************************
	DATABASE
**************************************************************/

// declare mongoose DB
// localhost
mongoose.connect("mongodb://localhost:27017/weddingRsvpDB", {
  useNewUrlParser: true,
  useFindAndModify: false
});


//create table Schema
// const guestsSchema = new mongoose.Schema({
//   firstName: String,
//   lastName: String,
//   mobileNum: Number,
//   rsvp: String
// });

//create model of Schema
//table for VLookup
const guestsLookupSchema = new mongoose.Schema({
  guestName: String,
  mobileNum: Number,
  rsvp: String
});

//create model of Schema
const Lookups = mongoose.model("Lookup", guestsLookupSchema);

//create first entry which is always hapy
const hapy = new Lookups({
  guestName: "Hapy Benitez",
  mobileNum: 9518079185,
  rsvp: "accepts"
});

//Register table
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  password: String,
  isAdmin: Boolean
});

userSchema.plugin(passportLocalMongoose);

const User = new mongoose.model("User", userSchema);

/*************************************************************
	ROUTES
**************************************************************/

app.get('/', function(req, res){
  res.render('home');
});
app.get('/home-new', function(req, res){
  res.render('home-new');
});

app.get('/faq', function(req, res){
  res.render('faq');
});

app.get('/contact', function(req, res){
  res.render('contact');
});

app.get('/events', function(req, res){
  res.render('events');
});

app.get('/suppliers', function(req, res){
  res.render('suppliers');
});
app.get('/gallery', function(req, res){
  res.render('gallery');
});

app.get('/add-confirm', function(req, res){
  res.render('add-confirm');
});


/*************************************************************
RSVP
**************************************************************/

app.get('/rsvp', function(req, res){
if(isLoggedIn){
  Lookups.find({}, function(err, foundItems){
    if(foundItems.length === 0){
      //insert default only when table is empty
      //save default records
      hapy.save(function(err, guest){
        if(err){
          console.log(err);
        }
        else{
          console.log(guest.guestName +" "+ " has been added!");
        }
      });

        res.render('rsvp');
    }
    else{
      var guestNames = [];

      foundItems.forEach(function(item){
        guestNames.push(item.guestName);
      });
      res.render('rsvp', {guestListItems: guestNames});
    }
  });
}
else{
  // res.redirect("login");
  res.redirect("404");
}


});

app.post('/rsvp', function(req, res){
  const lookedup = req.body;
  const filter = {guestName: lookedup.guestName};
  const update = {mobileNum: lookedup.mobileNum3, rsvp: lookedup.response3}


  Lookups.find(filter, function(err, foundGuest){
    if(err){
      res.send("uh-oh, something went wrong");
    }
    else{
      if(foundGuest.length === 0 ){
        console.log("No one with that name matched the database");
        //set messages
        req.flash('danger','The name '+ lookedup.guestName +' was not found in the list. Please make sure the spelling is correct. ');
        res.redirect('/rsvp');
      }
      else{
        console.log("continue with rsvp");
        Lookups.findOneAndUpdate(filter, update, { new: true }, function(err, results){
        if(err){
          console.log("error updating record");
        }
        else{
          console.log("success!");
          res.render("confirmation", {guestInfo: lookedup});
          sendConfirmationtoHK(lookedup.guestName, lookedup.response3);
        }
        });
      }
    }
  });



});

function validateForm(formFields){
  const phoneRegexp = /^\d{11}$/gm;
  var phoneResult = phoneRegexp.test(formFields.mobileNum);
   console.log("phone:"+phoneResult);


}

/*************************************************************
	REGISTER & lOGIN
**************************************************************/

app.get('/login', function(req, res){
  res.render('404');
});

app.get('/logout', function(req, res){
  req.logout();
  isLoggedIn = false;
  isAdmin = false;
  res.redirect('/');
});

app.get('/register', function(req, res){
  res.render('404');
});

app.post('/register', function(req,res){

  bcrypt.hash(req.body.password, saltRounds, function(err, hash){
    const newUser = new User({
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.username,
      password: hash,
      isAdmin: false
    });

    newUser.save(function(err){
      if(err){
        console.log(err);
      }
      else{
        isLoggedIn = true;
        console.log(req.body.username);
        req.flash('success','Registered Successfully!');
        res.redirect("/rsvp");
      }
    });
  });

});

app.post('/login', function(req,res){
const username = req.body.username;
const password = req.body.password;

User.findOne({email: username}, function(err, foundUser){
  if(err){
    console.log(err);
  }
  else{
    if(foundUser){
      bcrypt.compare(password, foundUser.password, function(err, result) {
          if(result === true){
            isLoggedIn = true;
            isAdmin = foundUser.isAdmin;
            req.flash('success','Logged in Successfully!');
            res.redirect("/rsvp");
          }
          else{
            //invalid user
            console.log("invalid username/password");
            req.flash('danger','Invalid Username or password! Please try again.');
            res.redirect("/login");
          }

        });
    }
    else{
      console.log("cannot find user:" + username);
      req.flash('danger',"We couldn't find that Email address in our records. Please register.");
      res.redirect("/register");
    }
  }
});



});

/*************************************************************
	ADMIN

	Adding Guests
	Deleting Guests
**************************************************************/

app.get('/add-guests', function(req, res){
  if(!isAdmin){
    res.render('404');
  }
  else{
    res.render('add-guests');
  }
});


//Add new guests
app.post('/add-guests', [
  check('guestName').trim().escape()],

  function(req, res){

  const errors = validationResult(req);
   if (!errors.isEmpty()) {
     return res.status(422).json({ errors: errors.array() });
   }


  console.log(req.body);
  const newLookup = req.body;

  //validate form fields
  //let validated = validateForm(newGuest);

  //create new instance from guest model
  const newLookupInfo = new Lookups({
    guestName: newLookup.guestName,
    mobileNum: 99999999999,
    rsvp: "No RSVP"
  });

  //save new record
  newLookupInfo.save(function(err, guest){
    if(err)
    console.log(err);
    else{
      console.log("New Guest " + guest.guestName + " has been added!");
      res.render("add-confirm", {guestInfo: newLookupInfo});
    }
  });

});


//Delete an item
app.post("/delete-guest", function(req, res){
  const deleteItemId = req.body.deleteBtn;
    console.log("deleting record: " + deleteItemId);
    Lookups.findByIdAndRemove(deleteItemId, function(err){
      if(err)
      console.log(err);
      else{
        console.log("Successfully deleted guest");
        res.redirect("/guest-list");

      }
    })
});

app.get('/registered-guests', function(req, res){
  if(!isAdmin)
  {
    res.render('404');

  }
  else{
    User.find({}, function(err, foundItems){
      if(foundItems.length === 0){
        res.send("no guests have registered");
      }
      else{
        res.render('registered-guests', {guestListItems: foundItems});
      }
    });
  }

});


app.get('/guest-list', function(req, res){
  if(!isAdmin){
    res.render('404');
  }
  else{
    //check if db is not empty
     Lookups.find({}, function(err, foundItems){
       if(foundItems.length === 0){
         //insert default only when table is empty
         //save default records
         hapy.save(function(err, guest){
           if(err){
             console.log(err);
           }
           else{
             console.log(guest.guestName +" "+ "has been added!");
           }
         });
           res.render('guest-list');
       }
       else{
         res.render('guest-list', {guestListItems: foundItems});
       }
     });
  }



});


/*************************************************************
	ERRORS
**************************************************************/


// 404
app.use(function(req, res, next) {
  return res.status(404).render('404');
});

// 500 - Any server error
app.use(function(err, req, res, next) {
  return res.status(500).render('500');
});


/*************************************************************
	EMAIL
**************************************************************/

//send Email to thattingcalledhapynez
function sendConfirmationtoHK(name, rsvp){

  async function main() {
      // Generate test SMTP service account from ethereal.email
      // Only needed if you don't have a real mail account for testing
      let testAccount = await nodemailer.createTestAccount();

      // create reusable transporter object using the default SMTP transport
      let transporter = nodemailer.createTransport({
          host: 'smtp.googlemail.com',
          port: 465,
          secure: true, // true for 465, false for other ports
          auth: {
              user: process.env.EMAIL, // generated ethereal user
              pass: process.env.EMAIL_PASSWORD // generated ethereal password
          },
          tls:{
         rejectUnauthorized: false
     }
      });

      //get the date
      let today = new Date();
      let date = (today.getMonth()+1)+'/'+today.getDate() +'/'+today.getFullYear();
      let time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();

      let  rsvpForEmail = (rsvp == 'accept') ? 'accepted' : 'declined';

      // send mail with defined transport object
      let info = await transporter.sendMail({
          from: '"That Ting Called Hapynez" <thattingcalledhapynez@gmail.com>', // sender address
          to: 'thattingcalledhapynez@gmail.com', // list of receivers
          subject: 'Wedding RSVP received', // Subject line
          text: name + rsvp +" your invitation.", // plain text body
          html: 'Hi Kevin and Hapy, <br><br><b>'+name+'</b> has <b>'+rsvpForEmail+'</b> your invitation on '+ date+'. <br><br> sincerely,<br>ThatTingCalledHapynez', // html body
          sendMail: true
      });

      console.log('Message sent: %s', info.messageId);
      // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
      console.log(name + " " + rsvp + " " + date + " " + time);
      // Preview only available when sending through an Ethereal account
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
      // Preview URL: https://ethereal.email/message/WaQKMgKddxQDoou...
  }
  main().catch(console.error);

}

/*************************************************************
	PORT LISTENERS
**************************************************************/

//run on both local and heroku
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
app.listen(port, function() {
  console.log("Server started successfully on port: " + port);
});
