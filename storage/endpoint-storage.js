/**
 * Vault — Persistent LinkedIn Endpoint Storage Layer
 * Thread-safe atomic JSON storage for LinkedIn Voyager / SDUI endpoint registry.
 */

const fs = require('fs');
const path = require('path');

const STORAGE_FILE = path.join(__dirname, 'endpoints.json');

const DEFAULT_REGISTRY = {
  updatedAt: Date.now(),
  auditRequestedAt: null,
  endpoints: {
    me: {
      name: 'Current User (Me)',
      url: '/voyager/api/me',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/feed/',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Press Ctrl+R (Refresh)',
        hint: '/voyager/api/me',
        copyTarget: 'Headers → Request URL',
      },
    },
    sendInvite: {
      name: 'Send Connection Invite',
      url: '/voyager/api/voyagerRelationshipsDashMemberRelationships?action=verifyQuotaAndCreateV2&decorationId=com.linkedin.voyager.dash.deco.relationships.InvitationCreationResultWithInvitee-2',
      method: 'POST',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'POST_ACTION',
        method: 'POST',
        pageUrl: 'https://www.linkedin.com/in/{profile}',
        networkFilter: 'status-code:200 method:POST',
        action: 'Click "Connect" -> "Send" (without note)',
        hint: 'verifyQuotaAndCreateV2',
        copyTarget: 'Headers → Request URL',
      },
    },
    withdrawInvitation: {
      name: 'Withdraw Invitation',
      url: '/flagship-web/rsc-action/actions/server-request?sduiid=com.linkedin.sdui.requests.mynetwork.addaWithdrawInvitation',
      method: 'POST',
      sduiid: 'com.linkedin.sdui.requests.mynetwork.addaWithdrawInvitation',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'POST_ACTION',
        method: 'POST',
        pageUrl: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
        networkFilter: 'status-code:200 method:POST',
        action: 'Click "Withdraw" on any pending invitation',
        hint: 'server-request?sduiid=...addaWithdrawInvitation (also check Payload tab)',
        copyTarget: 'Headers → Request URL',
      },
    },
    listSentInvitations: {
      name: 'List Sent Invitations',
      url: '/voyager/api/relationships/sentInvitationViewsV2?count=100&invitationType=CONNECTION&q=invitationType&start=0',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Open or refresh "Sent Invitations" tab',
        hint: 'sentInvitationViewsV2 or graphql / server-request',
        copyTarget: 'Headers → Request URL',
      },
    },
    connectionsSummary: {
      name: 'Connections Summary',
      url: '/voyager/api/relationships/connectionsSummary',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/mynetwork/invite-connect/connections/',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Open the "Connections" tab under My Network',
        hint: 'connectionsSummary (or Doc / Ctrl+Shift+F if SSR)',
        copyTarget: 'Headers → Request URL',
      },
    },
    messengerConversations: {
      name: 'Messenger Conversations',
      url: '/voyager/api/voyagerMessagingGraphQL/graphql?queryId=messengerConversations.9501074288a12f3ae9e3c7ea243bccbf',
      method: 'GET',
      queryId: 'messengerConversations.9501074288a12f3ae9e3c7ea243bccbf',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/messaging/',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Open Messaging inbox or click any conversation thread',
        hint: 'voyagerMessagingGraphQL/graphql?queryId=messengerConversations...',
        copyTarget: 'Headers → Request URL',
      },
    },
    profileView: {
      name: 'Profile View (Dash)',
      url: '/voyager/api/identity/dash/profiles',
      method: 'GET',
      status: 'healthy',
      lastStatus: 200,
      lastCheckedAt: Date.now(),
      lastError: null,
      lastAlertedAt: null,
      captureGuide: {
        captureType: 'GET_LIST',
        method: 'GET',
        pageUrl: 'https://www.linkedin.com/in/{profile}',
        networkFilter: 'status-code:200 larger-than:3k',
        action: 'Navigate to any member profile page',
        hint: '/voyager/api/identity/dash/profiles',
        copyTarget: 'Headers → Request URL',
      },
    },
  },
};

function readEndpoints() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      writeEndpoints(DEFAULT_REGISTRY);
      return JSON.parse(JSON.stringify(DEFAULT_REGISTRY));
    }
    const raw = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.endpoints) parsed.endpoints = {};

    // Ensure all default seeds exist and capture guides are up to date
    let needsSave = false;
    for (const [key, defaultVal] of Object.entries(DEFAULT_REGISTRY.endpoints)) {
      if (!parsed.endpoints[key]) {
        parsed.endpoints[key] = { ...defaultVal };
        needsSave = true;
      } else {
        const ep = parsed.endpoints[key];
        if (!ep.captureGuide) {
          ep.captureGuide = { ...defaultVal.captureGuide };
          needsSave = true;
        } else {
          for (const [k, v] of Object.entries(defaultVal.captureGuide)) {
            if (ep.captureGuide[k] !== v) {
              ep.captureGuide[k] = v;
              needsSave = true;
            }
          }
        }
      }
    }
    if (needsSave) {
      writeEndpoints(parsed);
    }
    return parsed;
  } catch (err) {
    console.error('[Endpoint Storage] Read error:', err.message);
    return JSON.parse(JSON.stringify(DEFAULT_REGISTRY));
  }
}

function writeEndpoints(data) {
  try {
    const tmpFile = `${STORAGE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STORAGE_FILE);
  } catch (err) {
    console.error('[Endpoint Storage] Atomic write error:', err.message);
  }
}

module.exports = {
  readEndpoints,
  writeEndpoints,
  DEFAULT_REGISTRY,
};

