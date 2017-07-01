'use strict'

const http = require('http');
require('dotenv').config()

// Initialize using verification token from environment variables
const createSlackEventAdapter = require('@slack/events-api').createSlackEventAdapter;
const slackEvents = createSlackEventAdapter(process.env.SLACK_VERIFICATION_TOKEN);
const port = process.env.PORT || 3000;
const { createMessageAdapter } = require('@slack/interactive-messages');
// Initialize adapter using verification token from environment variables
const slackMessages = createMessageAdapter(process.env.SLACK_VERIFICATION_TOKEN);

// Initialize an Express application
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// You must use a body parser for JSON before mounting the adapter
app.use(bodyParser.json());

// You must use a body parser for the urlencoded format before mounting the adapter
app.use(bodyParser.urlencoded({ extended: false }));


var Promise = require("bluebird")
var moment = require('moment')

var trelloKey = process.env.TRELLO_PUBLIC_KEY
var trelloToken = process.env.TRELLO_PRIVATE_TOKEN
var projectsBoardId = 'YrLvMUKq'
var customFieldName = 'YrLvMUKq-jzFxcm'

var Trello = require("node-trello")
var t = Promise.promisifyAll(new Trello(trelloKey, trelloToken))

var RtmClient = require('@slack/client').RtmClient;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS
var botToken = process.env.SLACK_BOT_TOKEN || ''
var rtm = new RtmClient(botToken)

var WebClient = require('@slack/client').WebClient;
var webChat = Promise.promisifyAll(new WebClient(botToken).chat)
var webUser = Promise.promisifyAll(new WebClient(botToken).users)


var HELP_TEXT = ['Kiss my front-butt!', 
  'Sweet someting of... someplace. ',
  '_[With brain slug on head, speaking in monotone]_ The flight had a stopover at the Brain Slug Planet. Hermes liked is so much he decided to stay of his own free will.',
  'My Manwich!',
  'He\'ll be as strong and flexible as Gumby and Hercules combined.',
  'I\'m just glad my fat ugly mama is not alive to see this.'
]

var IN_MEMORY_DB = {}
var USERNAME_CACHE = {}

//*********************************************
// Setup different handlers for messages
//*********************************************

var getCardPluginDataUrl = function(cardId) {
  return `/1/cards/${cardId}/pluginData`
}

var readProjectsFromTrello = function(msg) {
  var activeProjUrl = `/1/boards/${projectsBoardId}/lists?cards=open&card_fields=id,name`

  return new Promise(function(resolve, reject) {
    t.getAsync(activeProjUrl).then(function(data) {
      var activeProjectsList = data && data[0] && data[0].cards
      if(!activeProjectsList) {
        reject(`Could not load Active Projects from Trello Board - is ${projectsBoardId} correct?`)
      }
      resolve(activeProjectsList)
    })
  })
}

var groupByCardId = function(listData) {
  var finalCardObject = {}
  // index by id so we can throw the pluginData in here later
  for (var card of listData) {
    finalCardObject[card.id] = card
  }
  return new Promise(function(resolve) {
    resolve(finalCardObject)
  })
  
}

var groupBySlackHandle = function(projectsById) {
  var promises = Object.keys(projectsById).map(function(key) {
    return t.getAsync(getCardPluginDataUrl(key))
  })
  return Promise.all(promises).then(function(c) {
    for (var card of c) {
      var cardPluginData = card[0]
      var fields = JSON.parse(cardPluginData.value).fields
      var slackHandle = fields[customFieldName]
      projectsById[cardPluginData.idModel]['slackHandle'] = slackHandle
    }
    var data = Object.keys(projectsById).map(function (key) { return projectsById[key] })
    var groupedBySlackHandle = {}
    for (var project of data) {
      groupedBySlackHandle[project.slackHandle] = groupedBySlackHandle[project.slackHandle] || []
      groupedBySlackHandle[project.slackHandle].push(project)
    }
    return new Promise(function(resolve) {
      resolve(groupedBySlackHandle)
    })
  })
}

var convertUserIdToHandle = function(userId) {
  console.log('trying to convert ', userId)
  if(USERNAME_CACHE[userId]) {
    return new Promise(function(resolve) { resolve(USERNAME_CACHE[userId] )})
  }
  return new Promise(function(resolve) {
    webUser.infoAsync(userId).then(function(data) {
      console.log('data', data)
      USERNAME_CACHE[userId] = data.user.name
      resolve(data.user.name)
    })
  })
  
}

var generateListName = function() {
  // hopefully timezones don't break this
  var weekNumber = moment().isoWeek(); 
  var dateStr = moment().startOf('isoweek').format('MMMM D');
  return `Week ${moment().isoWeek()} - ${dateStr}`
}

var createList = function(listName) {
  var activeProjUrl = `/1/boards/${projectsBoardId}/lists`
  return t.postAsync(activeProjUrl, {
    name: listName,
    pos: 'bottom'
  })
}

var getProjectsThatNeedStatusUpdate = function(projectList) {
  // Check for list status first
  var activeProjUrl = `/1/boards/${projectsBoardId}/lists`
  return t.getAsync(activeProjUrl).then(function(data) {
    var listName = generateListName()
    var list = data.find(function(list) {return list.name == listName})
    if(list) {
      return new Promise(function(resolve) {
        resolve(list)
      })
    } else {
      return createList(listName)
    }
  }).then(function(list) {
    IN_MEMORY_DB['current_list_id'] = list.id
    return t.getAsync(`/1/lists/${list.id}/cards?fields=id,name`)
  }).then(function(cards) {
    return new Promise(function(resolve) {
      resolve(projectList.filter(function(project) {
        return (cards.findIndex(function(card) {card.id == project.id}) == -1)
      }))    
    })
  }
)}

var startConversations = function(bySlackHandle) {
  for (var slackHandle of Object.keys(bySlackHandle)) {
    // for now only do sang
    if (slackHandle == "sang") {
      var projects = bySlackHandle[slackHandle]
      var numProjects = projects.length
      // These may fire in the wrong order, but probably won't. 
      // Should theoretically chain these in strict .then order at some point.
      // Ask about the first project first. 
      webChat.postMessageAsync(`@${slackHandle}`, 
        `I have to ask you about ${numProjects} project(s) today.\n Let's start with *${projects[0].name}*.\n Let's start with a quick status update first.`, 
        {
          token: botToken, 
          as_user: true,
          attachments: [{
            "text": "What's the project status?",
            "callback_id": "project_status",
            "color": "#3AA3E3",
            "attachment_type": "default",
              "actions": [
                {
                    "name": "status",
                    "text": "Great",
                    "type": "button",
                    "value": "caution"
                },
                {
                    "name": "status",
                    "text": "Caution",
                    "type": "button",
                    "value": "caution"
                },                
                {
                    "name": "status",
                    "text": "Danger",
                    "type": "button",
                    "value": "danger"
                },                
          ]}]
        }
      ).then(function(data) {
        IN_MEMORY_DB[slackHandle] = {
          project: projects[0].name,
          step: 0,
          responses: []
        }
      })
    }
  }
}

// // The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
// rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
//   console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
// });

// // you need to wait for the client to fully connect before you can send messages
// rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
 
// })


// rtm.start();



// Mount the event handler on a route
// NOTE: you must mount to a path that matches the Request URL that was configured earlier
app.use('/slack/events', slackEvents.expressMiddleware());
app.use('/slack/actions', slackMessages.expressMiddleware());

// Attach action handlers by `callback_id`
// (See: https://api.slack.com/docs/interactive-message-field-guide#attachment_fields)
slackMessages.action('project_status', (payload) => {
  // `payload` is JSON that describes an interaction with a message.
  IN_MEMORY_DB[payload.user.name]

  // The `actions` array contains details about the specific action (button press, menu selection, etc.)
  const action = payload.actions[0];
  console.log(`The button had name ${action.name} and value ${action.value}`);

  // You should return a JSON object which describes a message to replace the original.
  // Note that the payload contains a copy of the original message (`payload.original_message`).
  const replacement = payload.original_message;
  // Typically, you want to acknowledge the action and remove the interactive elements from the message
  replacement.text = `Okay. I've noted that the project status is: ${action.value}.`;  
  delete replacement.attachments;
  return replacement;
});


// Attach listeners to events by Slack Event "type". See: https://api.slack.com/events/message.im
slackEvents.on('message', (event) => {
  if(event.bot_id || !event.user ) { // Ignore messages sent from other bots (namely, myself) or actions
    return
  }
  convertUserIdToHandle(event.user).then(function(handle) {
    console.log(`${handle} in channel ${event.channel} sez: ${event.text}`);
  })
});

// Handle errors (see `errorCodes` export)
slackEvents.on('error', console.error);

// Start the express application
http.createServer(app).listen(port, () => {
  console.log(`server listening on port ${port}`);
  onStart()
});


var onStart = function() {
   webChat.postMessageAsync('@sang', 'I just got restarted. I have no memory so I may have to start over.', {token: botToken, as_user: true}).then(
    readProjectsFromTrello
  ).then(
    getProjectsThatNeedStatusUpdate
  ).then(
    groupByCardId
  ).then(
    groupBySlackHandle
  ).then(
    startConversations
  )
}