<h1 align="center"><img src="https://raw.githubusercontent.com/VSCodeVim/Vim/master/images/icon.png" height="128"><br>VSCodeNeoVim</h1>
<p align="center"><strong>Vim emulation for Visual Studio Code.</strong></p>


<hr>

VSCodeNeoVim is a [Visual Studio Code](https://code.visualstudio.com/) rewrite of VSCodeVim, changing everything to be backed by Neovim.

This is the temporary repo for VSCodeNeovim for development purposes. Please submit PRs/issues here. This extension will not be released on the marketplace, but I will be providing a .vsix for testing purposes.

Some notes on contributing:
* Much of the VSCodeVim code is still in here. The only places it's used are things like some utility Position functions, etc.
* Most of the "hard" work is in extension.ts.
* The rest of the work is in srcNV. NvUtil contains a lot of utility functions with working with neovim rpc requests. RPCHandlers contain handlers for RPC requests.
* You need to have the newest nvim (installed from nightly/master) installed. At the very least, you need a version of neovim that has this issue fixed: https://github.com/neovim/neovim/issues/6166
* The easiest way to test is to have the neovim instance for VSCode be created by connecting to a pipe. In order to do so, set NVIM_LISTEN_ADDRESS equal to `/tmp/nvim`, open a neovim instance, and then open the extension. This allows you to see what's happening on the neovim side (any errors/prompts/etc.) This is how my typical setup for development looks: ![](https://i.imgur.com/gwck9Do.jpg). There's some code to do this automatically, but it doesn't check if `/tmp/nvim` is a socket, so it may still fail. Also, I think performance is slightly worse when you do this.


Other helpful documentation links:
https://vscodevim.slack.com/files/U3EUW86U9/F62R31A5V/Integrating_Neovim_into_VSCode "Design" doc
https://neovim.io/doc/user/api.html#api-global Neovim RPC API documentation
https://neovim.io/doc/user/ui.html Neovim remote UI documentation. We currently aren't using it but will likely use it at some point in the future.  
https://github.com/neovim/node-client The node client we're using  
https://github.com/lunixbochs/ActualVim Another neovim backed vim plugin (for sublime)


Important discussions links:
https://gitter.im/neovim/neovim For talking to the neovim devs
https://gitter.im/neovim/node-client For talking to the neovim node-client devs
https://vscodevim.slack.com/ For talking to the VSCodeVim devs

Important Neovim PRs to follow:
https://github.com/neovim/neovim/pull/5269 Text Diffs (so we don't have to sync the entire buffer each time)

Some screenshots (kinda hard to show what's changed without at least a gif...):
Wildmenu working!
![](https://i.imgur.com/7zMEd1G.jpg)
Autocomplete working!
![](https://i.imgur.com/aQ7jQyY.jpg)
