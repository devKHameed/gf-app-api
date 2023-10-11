import { ElasticTranscoder } from "aws-sdk";
import { getTranscoderClient } from ".";

export const splitAudioFile = async (
  fileName: string,
  startTime: string,
  duration: string
) => {
  const transcoder = await getTranscoderClient();
  const params: ElasticTranscoder.Types.CreateJobRequest = {
    PipelineId: "1685388561017-9dghrb",
    OutputKeyPrefix: "output/",
    Input: {
      Key: fileName,
      TimeSpan: {
        StartTime: startTime,
        Duration: duration,
      },
    },
    Output: {
      Key: fileName,
      PresetId: "1351620000001-300040",
    },
  };

  return await transcoder.createJob(params).promise();
};
