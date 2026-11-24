import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { requestPostMethod } from './base';

describe('AIGC API client', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('posts the selected scene to the session start endpoint', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ json: async () => ({}) } as Response);
    const start = requestPostMethod({
      action: 'StartSession',
      apiPath: '/session/start',
    });

    await start({ SessionID: 'page-session', SceneID: 'default' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3101/session/start?Action=StartSession',
      expect.objectContaining({
        method: 'post',
        body: JSON.stringify({ SessionID: 'page-session', SceneID: 'default' }),
      })
    );
  });
});
