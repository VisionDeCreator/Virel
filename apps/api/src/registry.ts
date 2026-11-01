import * as media from "./services/mediaActions";
import * as generation from "./services/generationActions";
import * as publishing from "./services/publishing";
import { publishTimeline } from "./services/timelinePublishing";
export const services = {
  "timeline:publish": publishTimeline,
  "mediaActions:beginUpload": media.beginUpload,
  "mediaActions:finishUpload": media.finishUpload,
  "mediaActions:preview": media.preview,
  "generationActions:quote": generation.quote,
  "publishing:publish": publishing.publish,
};
