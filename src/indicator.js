/* indicator.js
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */


import GObject from 'gi://GObject';
import Secret from 'gi://Secret';
import St from 'gi://St';

import * as Main      from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as SecretUtils from './secretUtils.js';
import TOTP from './totp.js';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';


function copyToClipboard(text)
{
    // this runs inside gnome-shell, so we use St
    let clipboard = St.Clipboard.get_default();
    clipboard.set_text(St.ClipboardType.PRIMARY, text);
    clipboard.set_text(St.ClipboardType.CLIPBOARD, text);
    Main.notify(_('OTP code copied to clipboard.'), text);
}


function makeLabel({issuer, name})
{
    return `${issuer}: ${name}`;
}


export default
class Indicator extends PanelMenu.Button {

    static {
        GObject.registerClass(this);
    }


    constructor(ext)
    {
        super();

        this._ext = ext;
        this._totp_items = [];

        let icon = new St.Icon(
            {
                icon_name: 'changes-prevent-symbolic',
                style_class: 'system-status-icon'
            }
        );
        this.add_child(icon);

        this._lock_item = this.menu.addAction(_('Lock OTP secrets'),
                                              this.lockSecrets.bind(this),
                                              'changes-prevent-symbolic');

        this._unlock_item = this.menu.addAction(_('Unlock OTP secrets'),
                                                this.unlockSecrets.bind(this),
                                                'changes-allow-symbolic');
        this._unlock_item.visible = !this._lock_item.visible;

        this.menu.addAction(_('Edit OTP secrets...'),
                            this.editSecrets.bind(this),
                            'document-edit-symbolic');

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('OTP Secrets')));


        Main.panel.addToStatusArea(ext.uuid, this);
    }


    _init()
    {
        super._init(0.5, 'TOTP');
    }


    async _onOpenStateChanged(menu, is_open)
    {
        super._onOpenStateChanged(menu, is_open);

        try  {
            if (is_open) {
                let locked = await SecretUtils.isOTPCollectionLocked();
                this._lock_item.visible = !locked;
                this._unlock_item.visible = locked;
                await this.addItems();
            } else
                this.clearItems();
        }
        catch (e) {
            logError(e, '_onOpenStateChanged()');
        }
    }


    async lockSecrets()
    {
        try {
            if (!await SecretUtils.lockOTPCollection())
                // Sometimes the keyring locks just fine, yet it reports incorrectly that
                // nothing was locked. So we double check here.
                if (!await SecretUtils.isOTPCollectionLocked())
                    Main.notify(_('Failed to lock OTP secrets.'));
        }
        catch (e) {
            logError(e, 'lockSecrets()');
            Main.notifyError(_('Error locking OTP secrets.'), _(e.message));
        }
    }


    async unlockSecrets()
    {
        try {
            if (!await SecretUtils.unlockOTPCollection())
                // Sometimes the keyring unlocks just fine, yet it reports incorrectly
                // that nothing was unlocked. So we double check here.
                if (await SecretUtils.isOTPCollectionLocked())
                    Main.notify(_('Failed to unlock OTP secrets.'));
        }
        catch (e) {
            logError(e, 'unlockSecrets()');
            Main.notifyError(_('Error unlocking OTP secrets.'), _(e.message));
        }
    }


    editSecrets()
    {
        this._ext.openPreferences();
    }


    async addItems()
    {
        try {
            let secrets = await SecretUtils.getOTPItems();
            this.clearItems();
            secrets.forEach(x => {
                let totp = new TOTP(x.get_attributes());
                let label = makeLabel(totp);
                this.addItem(label, totp);
            });
        }
        catch (e) {
            logError(e, 'addSecretItems()');
            Main.notifyError(_('Error retrieving OTP items.'), _(e.message));
        }
    }


    addItem(label, attributes)
    {
        let item = this.menu.addAction(label,
                                       this.copyCode.bind(this, attributes),
                                       'edit-copy-symbolic');

        this._totp_items.push(item);
    }


    clearItems()
    {
        this._totp_items.forEach(x => x.destroy());
        this._totp_items = [];
    }


    async copyCode(totp)
    {
        try {
            totp.secret = await SecretUtils.getSecret(totp);
            let code = totp.code();
            copyToClipboard(code);
        }
        catch (e) {
            logError(e, 'copyCode()');
            Main.notifyError(_('Error copying the OTP authentication code.'), _(e.message));
        }
    }

};
