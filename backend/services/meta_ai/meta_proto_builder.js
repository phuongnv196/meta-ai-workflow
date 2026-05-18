/**
 * Meta AI DGW Protobuf Builder
 * 
 * Sử dụng FileDescriptorProto được nhúng trong main.js của Meta để 
 * build payload Protobuf từ Object JavaScript thuần mà không cần file .proto thủ công.
 * 
 * Cách hoạt động:
 * 1. Extract binary proto descriptor từ main.js (đã làm trong extract_proto.js)
 * 2. Dùng protobufjs parse descriptor binary
 * 3. Build message từ JS Object -> encode thành Buffer -> base64 -> payload
 */

const protobuf = require('protobufjs');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

// ========================================================
// BƯỚC 1: PARSE PROTO DESCRIPTOR TỪ FILE BINARY ĐÃ EXTRACT
// ========================================================

/**
 * Đọc FileDescriptorProto binary (extract từ main.js)
 * và build Root của protobufjs từ đó.
 */
function loadProtoDescriptor() {
  const descriptorPath = path.join(__dirname, 'proto_descriptor.bin');
  const descriptorBin = fs.readFileSync(descriptorPath);

  // FileDescriptorProto binary: chứa định nghĩa tất cả message types
  // Ta cần parse thủ công vì protobufjs không có API đọc binary descriptor trực tiếp
  // Thay vào đó: decode tên fields từ binary descriptor bằng protobufjs Reader

  // CÁCH TIẾP CẬN THỰC TẾ:
  // Thay vì parse binary FileDescriptorProto (phức tạp),
  // ta dùng chính engine protobuf-es của Meta từ main.js nhưng qua cách khác:
  // Viết lại schema .proto từ những gì đã đọc được trong main.js

  const root = protobuf.Root.fromJSON(buildSchemaJSON());
  return root;
}

/**
 * Build schema JSON từ những gì đã reverse-engineer được từ main.js.
 * Message types chính đã xác định được:
 * - clippy.ecto.Request (rH = rX(rJ, 0))
 * - clippy.ecto.RequestMetadata (rQ = rX(rJ, 1))
 * - clippy.ecto.Prompt (ad = rX(rJ, 34))
 * - clippy.ecto.MessageId (ah = rX(rJ, 41))
 * - clippy.ecto.PromptId (aE = rX(rJ, 40))
 * - clippy.ecto.Attachment (ab = rX(rJ, 43))
 * - clippy.ecto.AttachmentId (a_ = rX(rJ, 44))
 * - clippy.ecto.AttachmentURLBundle (aS = rX(rJ, 49))
 * - clippy.ecto.ProductContext (rz = rX(rJ, 4))
 * - clippy.ecto.ConversationContextIds (al = rX(rJ, 31))
 * - clippy.ecto.TrafficControl (ae = rX(rJ, 22))
 * - clippy.ecto.AuthContext (an = rX(rJ, 24))
 * - clippy.ecto.UserIdentifiers (r7 = rX(rJ, 21))
 * - clippy.ecto.ProductData (r3 = rX(rJ, 12))
 * - clippy.ecto.MetaAIProductData (r5 = rX(rJ, 13))
 * - clippy.ecto.ModelInputOverrides (aa = rX(rJ, 27))
 * - clippy.ecto.Persona (r9 = rX(rJ, 11))
 * - clippy.ecto.ProductConfig (r0 = rX(rJ, 6))
 * - clippy.ecto.LocationData (ao = rX(rJ, 32))
 */
function buildSchemaJSON() {
  return {
    nested: {
      clippy: {
        nested: {
          ecto: {
            nested: {
              Request: {
                fields: {
                  metadata: { id: 1, type: "RequestMetadata" },
                  prompt: { id: 2, type: "Prompt" },
                  imagineOperation: { id: 3, type: "int32", optional: true },
                  imagineRequestId: { id: 4, type: "string", optional: true },
                  imagineParams: { id: 5, type: "ImagineParams", optional: true },
                }
              },
              ImagineParams: {
                fields: {
                  numMedia: { id: 1, type: "int32", optional: true },
                  orientation: { id: 2, type: "string", optional: true },
                  sourceMediaEntId: { id: 3, type: "string", optional: true },
                  instruction: { id: 4, type: "string", optional: true },
                  imageSource: { id: 5, type: "string", optional: true },
                  editTask: { id: 6, type: "string", optional: true },
                  presetIds: { id: 7, rule: "repeated", type: "string" },
                  imageUploadType: { id: 8, type: "string", optional: true },
                  mediaType: { id: 9, type: "string", optional: true },
                  prompt: { id: 10, type: "string", optional: true },
                  promptPieceEntIds: { id: 11, rule: "repeated", type: "string" },
                  sourceMediaUrl: { id: 12, type: "string", optional: true },
                  audioEntId: { id: 13, type: "string", optional: true },
                  startTimeMs: { id: 14, type: "int64", optional: true },
                  endTimeMs: { id: 15, type: "int64", optional: true },
                }
              },
              RequestMetadata: {
                fields: {
                  productContext: { id: 1, type: "ProductContext" },
                  userIds: { id: 2, type: "UserIdentifiers" },
                  trafficControl: { id: 3, type: "TrafficControl" },
                  authContext: { id: 4, type: "AuthContext" },
                  requestId: { id: 6, type: "string" },
                  modelInputOverrides: { id: 7, type: "ModelInputOverrides" },
                  conversationContextIds: { id: 10, type: "ConversationContextIds" },
                  locationData: { id: 15, type: "LocationData", optional: true },
                }
              },
              ProductContext: {
                fields: {
                  entryPoint: { id: 1, type: "string" },
                  appId: { id: 2, type: "string" },
                  appVersion: { id: 3, type: "string" },
                  configKey: { id: 4, type: "string" },
                  productData: { id: 5, type: "ProductData" },
                  appType: { id: 6, type: "int32" },
                  botChatType: { id: 7, type: "string" },
                  persona: { id: 8, type: "Persona" },
                  appName: { id: 10, type: "string" },
                  clientName: { id: 11, type: "string" },
                  productConfig: { id: 12, type: "ProductConfig" },
                  deviceOs: { id: 13, type: "string", optional: true },
                  promptType: { id: 14, type: "string", optional: true },
                  userAgent: { id: 15, type: "string", optional: true },
                  clientInterface: { id: 16, type: "string", optional: true },
                }
              },
              ProductData: {
                fields: {
                  metaAiProductData: { id: 5, type: "MetaAIProductData" }
                }
              },
              MetaAIProductData: {
                fields: {
                  conversationId: { id: 1, type: "string", optional: true }
                }
              },
              Persona: {
                fields: {
                  personaId: { id: 1, type: "string" },
                  personaVersion: { id: 2, type: "string" }
                }
              },
              ProductConfig: {
                fields: {
                  responseConfig: { id: 4, type: "ResponseConfig", optional: true }
                }
              },
              ResponseConfig: {
                fields: {
                  generateConversationTitle: { id: 1, type: "bool" }
                }
              },
              UserIdentifiers: {
                fields: {
                  accountId: { id: 1, type: "int64" },
                  appAccountId: { id: 2, type: "int64" },
                  userType: { id: 3, type: "int32" }
                }
              },
              TrafficControl: {
                fields: {
                  isShadow: { id: 2, type: "bool" },
                  isDgwRequest: { id: 4, type: "bool" }
                }
              },
              AuthContext: {
                fields: {
                  authTokens: { id: 1, rule: "repeated", type: "bytes" }
                }
              },
              ModelInputOverrides: {
                fields: {
                  thinkingEnabled: { id: 12, type: "bool" }
                }
              },
              ConversationContextIds: {
                fields: {
                  promptSessionId: { id: 1, type: "string", optional: true },
                  clientThreadId: { id: 4, type: "string", optional: true },
                  qplJoinId: { id: 3, type: "string", optional: true }
                }
              },
              LocationData: {
                fields: {
                  latitude: { id: 1, type: "string", optional: true },
                  longitude: { id: 2, type: "string", optional: true },
                  clientTimezone: { id: 4, type: "string", optional: true }
                }
              },
              Prompt: {
                fields: {
                  promptId: { id: 1, type: "PromptId" },
                  content: { id: 2, type: "string" },
                  attachments: { id: 3, rule: "repeated", type: "Attachment" }
                }
              },
              PromptId: {
                fields: {
                  identifier: { id: 1, type: "string" },
                  mid: { id: 2, type: "MessageId", optional: true },
                  isNewConversation: { id: 5, type: "bool" }
                }
              },
              MessageId: {
                fields: {
                  conversationId: { id: 1, type: "string" },
                  timestampMs: { id: 2, type: "int64" },
                  uniqueMessageId: { id: 3, type: "int64" },
                  eventId: { id: 4, type: "string" }
                }
              },
              Attachment: {
                fields: {
                  id: { id: 1, type: "AttachmentId", optional: true },
                  type: { id: 2, type: "int32", optional: true },
                  urls: { id: 3, type: "AttachmentURLBundle" },
                  location: { id: 5, type: "int32", optional: true },
                  mimeType: { id: 6, type: "string", optional: true },
                  filename: { id: 7, type: "string", optional: true }
                }
              },
              AttachmentId: {
                fields: {
                  fbid: { id: 1, type: "int64" },
                  fbtype: { id: 2, type: "int64" }
                }
              },
              AttachmentURLBundle: {
                fields: {
                  cdnUrlOriginal: { id: 1, type: "string" },
                  cdnUrlResized: { id: 2, type: "string" },
                  permanentUrl: { id: 3, type: "string" },
                  faviconUrl: { id: 4, type: "string" },
                  safeUrlForLogging: { id: 5, type: "string" }
                }
              }
            }
          }
        }
      }
    }
  };
}

// ========================================================
// BƯỚC 2: BUILD PAYLOAD TỪ JS OBJECT
// ========================================================

const FIXED_PERSONA_ID = "1522763855472543";
const FIXED_APP_ID = "1522763855472543";
const FIXED_CONFIG_KEY = "5a5b-8d4e-f054-99ef-b2de-db02-0d05-52c7";
const FIXED_ENTRY_POINT = "KADABRA__CHAT__UNIFIED_INPUT_BAR";

/**
 * Build Protobuf payload và trả về chuỗi Base64 sẵn để nhét vào DGW frame.
 * 
 * @param {Object} options - Tùy chọn build payload
 * @param {string} options.conversationId  - ID cuộc hội thoại
 * @param {string} options.turnId          - ID lượt (thường là UUID)
 * @param {string} options.requestId       - Request UUID
 * @param {string} options.promptText      - Nội dung câu hỏi
 * @param {string} [options.timezone]      - Timezone của user (vd: "Asia/Ho_Chi_Minh")
 * @param {string} [options.userAgent]     - User Agent
 * @param {boolean} [options.newConversation] - Có phải cuộc hội thoại mới không
 * @param {Array}   [options.attachments]  - Mảng file đính kèm [{id, mimeType, filename, cdnUrl}]
 */
async function buildClippyProtobufPayload(options) {
  const root = loadProtoDescriptor();

  const Request = root.lookupType("clippy.ecto.Request");
  const RequestMetadata = root.lookupType("clippy.ecto.RequestMetadata");
  const ProductContext = root.lookupType("clippy.ecto.ProductContext");
  const ProductData = root.lookupType("clippy.ecto.ProductData");
  const MetaAIProductData = root.lookupType("clippy.ecto.MetaAIProductData");
  const Persona = root.lookupType("clippy.ecto.Persona");
  const ProductConfig = root.lookupType("clippy.ecto.ProductConfig");
  const ResponseConfig = root.lookupType("clippy.ecto.ResponseConfig");
  const TrafficControl = root.lookupType("clippy.ecto.TrafficControl");
  const AuthContext = root.lookupType("clippy.ecto.AuthContext");
  const ModelInputOverrides = root.lookupType("clippy.ecto.ModelInputOverrides");
  const ConversationContextIds = root.lookupType("clippy.ecto.ConversationContextIds");
  const LocationData = root.lookupType("clippy.ecto.LocationData");
  const UserIdentifiers = root.lookupType("clippy.ecto.UserIdentifiers");
  const Prompt = root.lookupType("clippy.ecto.Prompt");
  const PromptId = root.lookupType("clippy.ecto.PromptId");
  const MessageId = root.lookupType("clippy.ecto.MessageId");
  const Attachment = root.lookupType("clippy.ecto.Attachment");
  const AttachmentId = root.lookupType("clippy.ecto.AttachmentId");
  const AttachmentURLBundle = root.lookupType("clippy.ecto.AttachmentURLBundle");

  const {
    conversationId,
    turnId,
    requestId,
    promptText,
    timezone = "Asia/Ho_Chi_Minh",
    userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    newConversation = false,
    attachments = []
  } = options;

  const nowMs = Date.now();

  // Build metadata
  const metadata = RequestMetadata.create({
    productContext: ProductContext.create({
      entryPoint: options.imagineOperation ? "KADABRA__IMAGINE_UNIFIED_CANVAS" : FIXED_ENTRY_POINT,
      appId: FIXED_APP_ID,
      appVersion: "",
      configKey: FIXED_CONFIG_KEY,
      productData: ProductData.create({
        metaAiProductData: MetaAIProductData.create({
          conversationId: conversationId
        })
      }),
      appType: 5, // ECTO_1
      botChatType: "HUMAN_AGENT",
      persona: Persona.create({ personaId: FIXED_PERSONA_ID, personaVersion: FIXED_PERSONA_ID }),
      appName: "ECTO1",
      clientName: "Abra Web Main Key",
      productConfig: ProductConfig.create({
        ...(newConversation ? {
          responseConfig: ResponseConfig.create({ generateConversationTitle: true })
        } : {})
      }),
      userAgent: userAgent,
      clientInterface: "desktop_web",
    }),
    userIds: UserIdentifiers.create({
      accountId: 0, appAccountId: 0, userType: 2 // EXTERNAL
    }),
    trafficControl: TrafficControl.create({ isShadow: false, isDgwRequest: true }),
    authContext: AuthContext.create({ authTokens: [] }),
    requestId: requestId,
    modelInputOverrides: ModelInputOverrides.create({ thinkingEnabled: false }),
    conversationContextIds: ConversationContextIds.create({
      clientThreadId: conversationId,
    }),
    locationData: LocationData.create({
      clientTimezone: timezone
    })
  });

  // Build attachments
  const builtAttachments = attachments.map(att => {
    return Attachment.create({
      ...(att.id ? {
        id: AttachmentId.create({ fbid: parseInt(att.id), fbtype: 0 })
      } : {}),
      type: 1, // IMAGE
      location: 1, // MANIFOLD
      mimeType: att.mimeType || "image/jpeg",
      filename: att.filename || ""
    });
  });

  // Build prompt
  const prompt = Prompt.create({
    promptId: PromptId.create({
      identifier: turnId,
      mid: MessageId.create({
        conversationId: conversationId,
        timestampMs: nowMs,
        uniqueMessageId: nowMs,
        eventId: ""
      }),
      isNewConversation: newConversation
    }),
    content: promptText,
    attachments: builtAttachments
  });

  // Build root request
  const request = Request.create({
    metadata,
    prompt,
    imagineOperation: options.imagineOperation || 0,
    imagineRequestId: options.imagineRequestId || "",
    imagineParams: options.imagineParams ? root.lookupType("clippy.ecto.ImagineParams").create(options.imagineParams) : null
  });

  // Verify & encode
  const err = Request.verify(request);
  if (err) throw new Error("Protobuf verify failed: " + err);

  const buffer = Request.encode(request).finish();
  return buffer.toString('base64');
}

/**
 * Function chuyên biệt để build payload Extend Video
 */
async function buildExtendVideoPayload(options) {
  const {
    conversationId,
    requestId,
    imagineRequestId, // ID của request sinh video gốc
    videoUrl,
    videoEntId,
    promptText = "Extend"
  } = options;

  return await buildClippyProtobufPayload({
    conversationId,
    turnId: crypto.randomUUID(),
    requestId,
    promptText,
    imagineOperation: 4, // EXTEND_VIDEO
    imagineRequestId: imagineRequestId,
    imagineParams: {
      sourceMediaUrl: videoUrl,
      sourceMediaEntId: videoEntId,
      instruction: promptText,
      mediaType: "video"
    }
  });
}

module.exports = { buildClippyProtobufPayload, buildExtendVideoPayload, loadProtoDescriptor };
