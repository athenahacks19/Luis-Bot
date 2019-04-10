// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
const path = require('path');
const ENV_FILE = path.join(__dirname, '.env');
require('dotenv').config({ path: ENV_FILE });

const { ActivityTypes, MessageFactory } = require('botbuilder');
const { LuisRecognizer } = require('botbuilder-ai');


// Welcomed User property name
const WELCOMED_USER = 'welcomedUserProperty';
const USER_PROFILE_PROPERTY = 'userProfileProperty';
const CONVERSATION_FLOW_PROPERTY = 'conversationFlowProperty';

var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

const question = {
    name: "name",
    none: "none",
    feeling: "feeling"
}
/**
 * A simple bot that responds to utterances with answers from the Language Understanding (LUIS) service.
 * If an answer is not found for an utterance, the bot responds with help.
 */
class LuisBot {
    /**
     * The LuisBot constructor requires one argument (`application`) which is used to create an instance of `LuisRecognizer`.
     * @param {LuisApplication} luisApplication The basic configuration needed to call LUIS. In this sample the configuration is retrieved from the .bot file.
     * @param {LuisPredictionOptions} luisPredictionOptions (Optional) Contains additional settings for configuring calls to LUIS.
     * @param {UserState} user User state to persist boolean flag to indicate if the bot had already welcomed the user
     */
    constructor(application, luisPredictionOptions, userState, conversationState) {
        this.welcomedUserProperty = userState.createProperty(WELCOMED_USER);
        this.userProfile = userState.createProperty(USER_PROFILE_PROPERTY);
        this.conversationFlow = conversationState.createProperty(CONVERSATION_FLOW_PROPERTY);

        // The state management objects for the conversation and user state.
        this.conversationState = conversationState;
        this.userState = userState;

        this.luisRecognizer = new LuisRecognizer(application, luisPredictionOptions, true);

    }

    /**
     * Every conversation turn calls this method.
     * There are no dialogs used, since it's "single turn" processing, meaning a single request and
     * response, with no stateful conversation.
     * @param {TurnContext} turnContext A TurnContext instance, containing all the data needed for processing the conversation turn.
     */
    async onTurn(turnContext) {
        // By checking the incoming Activity type, the bot only calls LUIS in appropriate cases.
        if (turnContext.activity.type === ActivityTypes.Message) {
            // Read UserState.
            const didBotWelcomedUser = await this.welcomedUserProperty.get(turnContext, false);
            let userName = turnContext.activity.from.name;
            if (didBotWelcomedUser === false) {
                // Get the state properties from the turn context.
                const flow = await this.conversationFlow.get(turnContext, { lastQuestionAsked: question.none });
                const profile = await this.userProfile.get(turnContext, {});

                await this.fillOutUserProfile(flow, profile, turnContext);

                // Save state changes
                await this.conversationFlow.set(turnContext, flow);
                await this.conversationState.saveChanges(turnContext);

                await this.userProfile.set(turnContext, profile);
                await this.userState.saveChanges(turnContext);

                // Set the flag indicating the bot handled the user's first message.
                await this.welcomedUserProperty.set(turnContext, true);
            } 
           
        } else if (turnContext.activity.type === ActivityTypes.ConversationUpdate) {
            // Send greeting when users are added to the conversation.
            await this.sendWelcomeMessage(turnContext);
        } else if (turnContext.activity.type !== ActivityTypes.ConversationUpdate) {
            // Generic message for all other activities
            await turnContext.sendActivity(`[${ turnContext.activity.type } event detected]`);
        }
    }

    /**
     * Sends welcome messages to conversation members when they join the conversation.
     * Messages are only sent to conversation members who aren't the bot.
     * @param {TurnContext} turnContext
     */
    async sendWelcomeMessage(turnContext) {
        
        // Do we have any new members added to the conversation?
        if (turnContext.activity.membersAdded.length !== 0) {

            // Iterate over all new members added to the conversation
            for (let idx in turnContext.activity.membersAdded) {

                if (turnContext.activity.membersAdded[idx].id !== turnContext.activity.recipient.id) {
                    await turnContext.sendActivity("Hello! My name is Autis, and I’d like to be your friend.");
                }
            }
        }
    }

    async getSentiment(text) {
        return new Promise(resolve => {
            var data = {
                "documents": [
                    {
                        "language": "en",
                        "id": "1",
                        "text": text
                    }
                ]
            };
            var xhr = new XMLHttpRequest();
            xhr.withCredentials = true;

            xhr.addEventListener("readystatechange", function() {
                if (this.readyState === 4) {
                    var json = JSON.parse(this.responseText);
                    return resolve(json.documents[0].score);
                }
            });

            xhr.open("POST", API_ENDPOINT);
            xhr.setRequestHeader("Ocp-Apim-Subscription-Key", API_KEY);
            xhr.setRequestHeader("Content-Type", "application/json");
            xhr.setRequestHeader("Accept", "application/json");

            xhr.send(JSON.stringify(data));
        });
    }
    // Manages the conversation flow for filling out the user's profile.
    async fillOutUserProfile(flow, profile, turnContext) {
        const input = turnContext.activity.text;

        switch (flow.lastQuestionAsked) {
            case question.none:
                await turnContext.sendActivity("I see that this is your first time. What is your name?");
                flow.lastQuestionAsked = question.name;
                break;

            case question.name:
                profile.name = input;
                await turnContext.sendActivity("Nice to meet you, " + profile.name);
                await turnContext.sendActivity("How are you feeling today?");

                flow.lastQuestionAsked = question.feeling;
                break;
            
            case question.feeling:

                var score = await this.getSentiment(input);

                if (score >= 0 && score <= 0.01) {
                    await turnContext.sendActivity("I’m really sorry to hear that! Would you like me to get your mom?");

                    flow.lastQuestionAsked = question.none;

                    return;
                }
                else if (score > 0.01 && score <= 0.49) {
                    await turnContext.sendActivity(" I see. Maybe playing a game will make you feel better!");
                }
                else if (score > 0.49 && score <= 0.85) {
                    await turnContext.sendActivity("I see. Looks like you need a little pinch of happy memes!");
                }
                else {
                    await turnContext.sendActivity("Good to hear that you are doing well " + profile.name + "!");
                }

                flow.lastQuestionAsked = question.none;

                break;
                
        }
    }
}

module.exports.LuisBot = LuisBot;
