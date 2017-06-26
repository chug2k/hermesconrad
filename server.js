'use strict'

const express = require('express')
// const Slapp = require('slapp')
// const Message = require('slapp/message')
// const ConvoStore = require('slapp-convo-beepboop')
// const Context = require('slapp-context-beepboop')
var Promise = require("bluebird")
require('dotenv').config()
var moment = require('moment')


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
var botToken = process.env.SLACK_BOT_TOKEN || ''
var rtm = new RtmClient(botToken)

var WebClient = require('@slack/client').WebClient;
var webChat = Promise.promisifyAll(new WebClient(botToken).chat)


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
    console.log('c', c)
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
    return t.getAsync(`/1/lists/${list.id}/cards?fields=id,name`)
  }).then(function(cards) {
    return new Promise(function(resolve) {
      resolve(projectList.filter(function(project) {
        return (cards.findIndex(function(card) {card.id == project.id}) == -1)
      }))    
    })
  }
)}

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
  console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}, but not yet connected to a channel`);
});

// you need to wait for the client to fully connect before you can send messages
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
  webChat.postMessageAsync('@sang', 'I just got restarted', {token: botToken, as_user: true}).then(
    readProjectsFromTrello
  ).then(
    getProjectsThatNeedStatusUpdate
  ).then(
    groupByCardId
  ).then(
    groupBySlackHandle
  ).then(
    function(data) {
      console.log('ahhh', data)
    }
  )
})


rtm.start();



// // start http server
// server.listen(port, (err) => {
//   if (err) {
//     return console.error(err)
//   }

//   console.log(`Listening on port ${port}`)
// })
