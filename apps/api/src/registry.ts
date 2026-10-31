import * as media from "./services/mediaActions";
import * as generation from "./services/generationActions";
import * as publishing from "./services/publishing";
export const services = {
  "mediaActions:beginUpload": media.beginUpload,
  "mediaActions:finishUpload": media.finishUpload,
  "mediaActions:preview": media.preview,
  "generationActions:quote": generation.quote,
  "publishing:publish": publishing.publish,
};
