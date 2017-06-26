'use strict'

const express = require('express')
// const Slapp = require('slapp')
// const Message = require('slapp/message')
// const ConvoStore = require('slapp-convo-beepboop')
// const Context = require('slapp-context-beepboop')
var Promise = require("bluebird")
require('dotenv').config()


// use `PORT` env var on Beep Boop - default to 3000 locally
var port = process.env.PORT || 3000

// var slapp = Slapp({
//   // Beep Boop sets the SLACK_VERIFY_TOKEN env var
//   verify_token: process.env.SLACK_VERIFY_TOKEN,
//   convo_store: ConvoStore(),
//   context: Context()
// })

// TODO: Change this to bot.yml secrets
var trelloKey = process.env.TRELLO_PUBLIC_KEY
var trelloToken = process.env.TRELLO_PRIVATE_TOKEN
var projectsBoardId = 'YrLvMUKq'
var customFieldName = 'YrLvMUKq-jzFxcm'

var Trello = require("node-trello")
var t = Promise.promisifyAll(new Trello(trelloKey, trelloToken))

var RtmClient = require('@slack/client').RtmClient;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS
var bot_token = process.env.SLACK_BOT_TOKEN || ''
var rtm = new RtmClient(bot_token)

var WebClient = require('@slack/client').WebClient;
var token = process.env.SLACK_BOT_TOKEN || ''
var webChat = Promise.promisifyAll(new WebClient(token).chat)


var HELP_TEXT = ['Kiss my front-butt!', 
  'Sweet someting of... someplace. ',
  '_[With brain slug on head, speaking in monotone]_ The flight had a stopover at the Brain Slug Planet. Hermes liked is so much he decided to stay of his own free will.',
  'My Manwich!',
  'He\'ll be as strong and flexible as Gumby and Hercules combined.',
  'I\'m just glad my fat ugly mama is not alive to see this.'
]

//*********************************************
// Setup different handlers for messages
//*********************************************

// response to the user typing "help" with a random hermes quote.
// slapp.message('help', ['mention', 'direct_message'], (msg) => {
//   msg.say(HELP_TEXT)
// })

// // We'll need to read state for different projects. To do this, we'll read from each card on Trello.

// var sayError = function(msg, textToSay) {
//   console.log('error')
//   msg.say(textToSay || 'generic error')
// }


var readProjectsFromTrello = function(msg) {
  var activeProjUrl = `/1/boards/${projectsBoardId}/lists?cards=open&card_fields=id,name`
  var getCardPluginDataUrl = function(cardId) {
    return `/1/cards/${cardId}/pluginData`
  }
  return new Promise(function(resolve, reject) {
    t.getAsync(activeProjUrl).then(function(data) {
      var activeProjectsList = data && data[0] && data[0].cards
      if(!activeProjectsList) {
        reject(`Could not load Active Projects from Trello Board - is ${projectsBoardId} correct?`)
      }
      var finalCardObject = {}
      // index by id so we can throw the pluginData in here later
      for (var card of activeProjectsList) {
        finalCardObject[card.id] = card
      }
      var promises = activeProjectsList.map(function(card) {
        return t.getAsync(getCardPluginDataUrl(card.id))
      })
      Promise.all(promises).then(function(c) {
          for (var card of c) {
            var cardPluginData = card[0]
            var fields = JSON.parse(cardPluginData.value).fields
            var slackHandle = fields[customFieldName]
            finalCardObject[cardPluginData.idModel]['slackHandle'] = slackHandle
          }
          var data = Object.keys(finalCardObject).map(function (key) { return finalCardObject[key] })
          var groupedBySlackHandle = {}
          for (var project of data) {
            groupedBySlackHandle[project.slackHandle] = groupedBySlackHandle[project.slackHandle] || []
            groupedBySlackHandle[project.slackHandle].push(project)
          }
          resolve(groupedBySlackHandle)
      })
    })
  })
}


let channel;

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  for (const c of rtmStartData.channels) {
    if (c.is_member && c.name ==='general') { channel = c.id }
  }
  console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

// you need to wait for the client to fully connect before you can send messages
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
  console.log('would post hi to ', "@sang", token)
  webChat.postMessageAsync('@sang', 'hello', {token: token, as_user: true}).then(function(data) {
    console.log('sent message')
  }), function(err) {
    console.log('err', err)
  }
});

rtm.start();




// slapp
//   .message('test', ['direct_mention', 'direct_message'], (msg, text) => {
//     readProjectsFromTrello(msg).then(function(data) {
//       Message.say({channel: '@sang', text: 'data '+ data})
//     }, function(e) {
//       sayError(e)
//     })
//   })

// // "Conversation" flow that tracks state - kicks off when user says hi, hello or hey
// slapp
//   .message('^(hi|hello|hey)$', ['direct_mention', 'direct_message'], (msg, text) => {
//     msg
//       .say(`${text}, how are you?`)
//       // sends next event from user to this route, passing along state
//       .route('how-are-you', { greeting: text })
//   })
//   .route('how-are-you', (msg, state) => {
//     var text = (msg.body.event && msg.body.event.text) || ''

//     // user may not have typed text as their next action, ask again and re-route
//     if (!text) {
//       return msg
//         .say("Whoops, I'm still waiting to hear how you're doing.")
//         .say('How are you?')
//         .route('how-are-you', state)
//     }

//     // add their response to state
//     state.status = text

//     msg
//       .say(`Ok then. What's your favorite color?`)
//       .route('color', state)
//   })
//   .route('color', (msg, state) => {
//     var text = (msg.body.event && msg.body.event.text) || ''

//     // user may not have typed text as their next action, ask again and re-route
//     if (!text) {
//       return msg
//         .say("I'm eagerly awaiting to hear your favorite color.")
//         .route('color', state)
//     }

//     // add their response to state
//     state.color = text

//     msg
//       .say('Thanks for sharing.')
//       .say(`Here's what you've told me so far: \`\`\`${JSON.stringify(state)}\`\`\``)
//     // At this point, since we don't route anywhere, the "conversation" is over
//   })

// // Can use a regex as well
// slapp.message(/^(thanks|thank you)/i, ['mention', 'direct_message'], (msg) => {
//   // You can provide a list of responses, and a random one will be chosen
//   // You can also include slack emoji in your responses
//   msg.say([
//     "You're welcome :smile:",
//     'You bet',
//     ':+1: Of course',
//     'Anytime :sun_with_face: :full_moon_with_face:'
//   ])
// })

// // demonstrate returning an attachment...
// slapp.message('attachment', ['mention', 'direct_message'], (msg) => {
//   msg.say({
//     text: 'Check out this amazing attachment! :confetti_ball: ',
//     attachments: [{
//       text: 'Slapp is a robust open source library that sits on top of the Slack APIs',
//       title: 'Slapp Library - Open Source',
//       image_url: 'https://storage.googleapis.com/beepboophq/_assets/bot-1.22f6fb.png',
//       title_link: 'https://beepboophq.com/',
//       color: '#7CD197'
//     }]
//   })
// })

// // Catch-all for any other responses not handled above
// slapp.message('.*', ['direct_mention', 'direct_message'], (msg) => {
//   // respond only 40% of the time
//   if (Math.random() < 0.4) {
//     msg.say([':wave:', ':pray:', ':raised_hands:'])
//   }
// })

// // attach Slapp to express server
// var server = slapp.attachToExpress(express())

// // start http server
// server.listen(port, (err) => {
//   if (err) {
//     return console.error(err)
//   }

//   console.log(`Listening on port ${port}`)
// })
