'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import { attach } from 'neovim';
import { NeovimClient } from 'neovim/lib/api/client';
import { TaskQueue } from 'aurelia-task-queue';
import { Position } from './src/common/motion/position';
import { Globals } from './src/globals';
import { Configuration } from './src/configuration/configuration';

import { spawn } from 'child_process';
import { NvUtil } from './srcNV/nvUtil';
import { RpcRequest } from './srcNV/rpcHandlers';
import { TextEditor } from './src/textEditor';
import { Screen, IgnoredKeys } from './srcNV/screen';
import { VimSettings } from './srcNV/vimSettings';
import { VscHandlers } from './srcNV/vscHandlers';

interface VSCodeKeybinding {
  key: string;
  command: string;
  when: string;
  vimKey: string;
}

const packagejson: {
  contributes: {
    keybindings: VSCodeKeybinding[];
  };
} = require('../package.json'); // out/../package.json

export namespace Vim {
  export let nv: NeovimClient;
  export let channelId: number;
  export let mode: { mode: string; blocking: boolean } = { mode: 'n', blocking: false };
  export let screen: Screen;
  export let prevState: { bufferTick: number } = {
    bufferTick: -1,
  };
  export let numVimChangesToApply = 0;
  export let taskQueue = new TaskQueue();
  // We're connecting to an already existing terminal instance, so externalized ui won't work.
  export let DEBUG: boolean;
}

export async function activate(context: vscode.ExtensionContext) {
  vscode.workspace.onDidCloseTextDocument(async event => {
    const deleted_file = event.fileName;
    let buf_id = await nvim.call('bufnr', [`^${deleted_file}$`]);
    if (buf_id === -1) {
      return;
    }
    // await nvim.command(`noautocmd ${buf_id}bw!`);
  });

  vscode.window.onDidChangeActiveTextEditor(VscHandlers.handleActiveTextEditorChange, this);

  vscode.window.onDidChangeTextEditorSelection(async e => {
    if (e.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
      if (e.selections[0]) {
        await NvUtil.setSelection(e.selections[0]);
      }
    }
  });

  /*
   * onDidChangeTextDocument fires when VS Code decides there have been
   * significant enough changes to warrant it.
   * One such situation is when the user presses <enter> and creates a new line.
   *
   * This is too late and too unreliable of an event to be able to respond to
   * key mappings from Neovim.
   */
  //vscode.workspace.onDidChangeTextDocument(VscHandlers.handleTextDocumentChange);

  // Event to update active configuration items when changed without restarting vscode
  vscode.workspace.onDidChangeConfiguration((e: void) => {
    Configuration.updateConfiguration();
  });

  overrideCommand(context, 'type', async args => {
    Vim.taskQueue.queueMicroTask(() => {
      VscHandlers.handleKeyEventNV(args.text);
    });
  });

  /*
   * The following are VS Code events that must be handled specially
   * to keep VS Code and Neovim in sync.
   */

  /*
  vscode.commands.registerCommand('acceptSelectedSuggestion', () => {
    // Related event: acceptSelectedSuggestionOnEnter

    // Autocomplete.
    // This event fires when a user inserts some text from a dropdown suggestion.
    // This event does not contain the completed text.
    // Instead, you will have to inspect the document before and after this event
    // to recover the completed text.

    // Just like the 'type' event, we will need a 'default:acceptSelectedSuggestion'
    // handler so that we can have VS Code act normally and update nvim at the right time.

    // We can use feedkeys to insert the text into nvim without expansion and
    // nvim will treat it as if the user typed it.
    // 'nt' options means treat the text as typed and do not remap
    // https://github.com/neovim/neovim/blob/4e02f1ab871f30d80250537877924d522497493b/src/nvim/api/vim.c

    // This function will eventually be something like:
    const preText = document.getText();
    await vscode.commands.executeCommand('default:acceptSelectedSuggestion');
    const postText = document.getText();
    const diffText = postText - preText;
    await NvUtil.atomFeedKeys(diffText, 'nt', true);
  });

  vscode.commands.registerCommand('acceptSnippet', () => {
    // I think this can be handled the same way as suggestions.
  });

  vscode.commands.registerCommand('deleteLeft', async () => {
    // Related events: deleteRight, deleteWordLeft, deleteAllLeft, etc.

    await Vim.input('<backspace>'); // or `<esc> dw i`, etc. for the other types of delete
    await Vim.getMostRecentDiff(); // Rather than sync the entire buffer, I hope we can use diffs to get a smaller update.
  });
  */

  const keysToBind = packagejson.contributes.keybindings;
  const ignoreKeys = Configuration.ignoreKeys;

  for (let key of keysToBind) {
    if (ignoreKeys.all.indexOf(key.vimKey) !== -1) {
      continue;
    }
    vscode.commands.executeCommand('setContext', `vim.use_${key.vimKey}`, true);
    registerCommand(context, key.command, () => {
      Vim.taskQueue.queueMicroTask(() => {
        VscHandlers.handleKeyEventNV(`${key.vimKey}`);
      });
    });
  }

  const proc = spawn(
    Configuration.neovimPath,
    [
      // '-u',
      // 'NONE',
      '-N',
      '--embed',
      vscode.window.activeTextEditor ? vscode.window.activeTextEditor!.document.fileName : '',
    ],
    {
      cwd: __dirname,
    }
  );

  proc.on('error', function (err) {
    console.log(err);
    vscode.window.showErrorMessage('Unable to setup neovim instance! Check your path.');
  });
  let nvim: NeovimClient;
  if (fs.existsSync('/tmp/nvim') && fs.lstatSync('/tmp/nvim').isSocket()) {
    nvim = attach({ socket: '/tmp/nvim' });
    Vim.DEBUG = true;
  } else {
    nvim = attach({ proc: proc });
    Vim.DEBUG = false;
  }
  Vim.nv = nvim;

  Vim.channelId = (await nvim.requestApi())[0] as number;

  const WIDTH = 50;
  const HEIGHT = 36;
  nvim.uiAttach(WIDTH, HEIGHT, { ext_cmdline: true, ext_wildmenu: true });
  Vim.screen = new Screen({ width: WIDTH, height: HEIGHT });

  const code = `
function _vscode_copy_text(text, line, char)
  vim.api.nvim_command('undojoin')
  vim.api.nvim_buf_set_lines(0, 0, -1, true, text)
  vim.api.nvim_call_function('setpos', {'.', {0, line, char, false}})
end
`;

  await Vim.nv.lua(code, []);
  await nvim.command('autocmd!');

  // todo(chilli): Create this map just from RPCHandlers and a decorator.
  const autocmdMap: { [autocmd: string]: string } = {
    BufWriteCmd: 'writeBuf',
    QuitPre: 'closeBuf',
    BufEnter: 'enterBuf',
    TabNewEntered: 'newTabEntered',
  };

  for (const autocmd of Object.keys(autocmdMap)) {
    await nvim.command(
      `autocmd ${autocmd} * :call rpcrequest(${Vim.channelId}, "${autocmdMap[
      autocmd
      ]}", expand("<abuf>"), fnamemodify(expand('<afile>'), ':p'), expand("<afile>"))`
    );
  }

  // Overriding commands to handle them on the vscode side.
  // await nvim.command(`nnoremap gd :call rpcrequest(${Vim.channelId},"goToDefinition")<CR>`);

  await NvUtil.setSettings(['noswapfile', 'hidden']);
  nvim.on('notification', (method: any, args: any) => {
    if (vscode.window.activeTextEditor && method === 'redraw') {
      Vim.screen.redraw(args);
    }
  });

  nvim.on('request', async (method: string, args: Array<any>, resp: any) => {
    if (RpcRequest[method] !== undefined) {
      const f = RpcRequest[method];
      f(args, resp);
    } else {
      console.log(`${method} is not defined!`);
    }
  });

  if (vscode.window.activeTextEditor) {
    await VscHandlers.handleActiveTextEditorChange();
  }
}

function overrideCommand(
  context: vscode.ExtensionContext,
  command: string,
  callback: (...args: any[]) => any
) {
  let disposable = vscode.commands.registerCommand(command, async args => {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    if (
      vscode.window.activeTextEditor.document &&
      vscode.window.activeTextEditor.document.uri.toString() === 'debug:input'
    ) {
      await vscode.commands.executeCommand('default:' + command, args);
      return;
    }

    callback(args);
  });
  context.subscriptions.push(disposable);
}

function registerCommand(
  context: vscode.ExtensionContext,
  command: string,
  callback: (...args: any[]) => any
) {
  let disposable = vscode.commands.registerCommand(command, async args => {
    if (!vscode.window.activeTextEditor) {
      return;
    }

    callback(args);
  });
  context.subscriptions.push(disposable);
}

process.on('unhandledRejection', function (reason: any, p: any) {
  console.log('Unhandled Rejection at: Promise ', p, ' reason: ', reason);
});
