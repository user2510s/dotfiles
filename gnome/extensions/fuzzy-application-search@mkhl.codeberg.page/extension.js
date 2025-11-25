import Gio from 'gi://Gio'
import Shell from 'gi://Shell'

import { Extension, InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js'

import { score } from './scoring.js'

export default class FuzzyApplicationSearch extends Extension {
	/** @type {InjectionManager} */
	injections
	/** @type {Shell.AppSystem} */
	appSystem
	/** @type {Gio.DesktopAppInfo[]} */
	apps

	enable() {
		this.appSystem = global.get_app_system()
		this.appSystem.connectObject('installed-changed', () => this.reload(), this)
		this.reload()

		this.injections = new InjectionManager()
		this.injections.overrideMethod(Shell.AppSystem, 'search', () => (query) => this.search(query))
		// also override SystemActions.getMatchingActions?
	}

	disable() {
		this.injections.clear()
		this.injections = undefined
		this.appSystem.disconnectObject(this)
		this.appSystem = undefined
		this.apps = undefined
	}

	reload() {
		console.debug(this.uuid, 'reloading installed applications...')
		this.apps = this.appSystem
			.get_installed()
			.filter((app) => app.should_show() && app instanceof Gio.DesktopAppInfo)
	}

	/**
	 * @param {string} query
	 * @returns {string[][]}
	 */
	search(query) {
		console.debug(this.uuid, 'searching for query:', query)
		const scored = sortByScoreDesc(scoreAll(query, this.apps))
		for (const [app, score] of scored) {
			console.debug(this.uuid, app, 'scored:', score)
		}
		return groupByScore(scored)
	}
}

/**
 * @template T
 * @typedef {[T, number]} Scored<T>
 */

/**
 * @param {string} query
 * @param {Gio.DesktopAppInfo[]} apps
 * @returns {Scored<string>[]}
 */
function scoreAll(query, apps) {
	return apps.flatMap((app) => {
		/** @type {string} */ const id = app.get_id()
		if (id === null) return []
		const score = scoreApp(query, app)
		if (score === 0) return []
		return [[id, score]]
	})
}

/**
 * @template T
 * @param {Scored<T>[]} scored
 * @returns {Scored<T>[]}
 */
function sortByScoreDesc(scored) {
	return scored.sort(([, a], [, b]) => b - a)
}

/**
 * @template T
 * @param {Scored<T>[]} scored
 * @returns {T[][]}
 */
function groupByScore(scored) {
	/**
	 * @param {T[][]} outer
	 * @param {T[]} inner
	 * @returns {T[][]}
	 */
	function concat(outer, inner) {
		return inner.length ? outer.concat([inner]) : outer
	}
	/** @type {[T[][], T[]]} */
	const [outer, inner] = scored.reduce(
		([outer, inner, last], [t, next]) =>
			last === next ? [outer, inner.concat([t]), next] : [concat(outer, inner), [t], next],
		[[], [], NaN],
	)
	return concat(outer, inner)
}

/**
 * @param {Gio.DesktioAppInfo} app
 * @returns {string[]}
 */
function infos(app) {
	return [app.get_name(), ...(app.get_keywords() ?? [])]
}

/**
 * @param {string} query
 * @param {Gio.DesktioAppInfo} app
 * @returns {number}
 */
function scoreApp(query, app) {
	const scores = infos(app).map((info) => score(query, info))
	return Math.max(...scores)
}
